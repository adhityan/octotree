const GH_RESERVED_USER_NAMES = [
  'settings', 'orgs', 'organizations',
  'site', 'blog', 'about', 'explore',
  'styleguide', 'showcases', 'trending',
  'stars', 'dashboard', 'notifications',
  'search', 'developer', 'account',
  'pulls', 'issues', 'features', 'contact',
  'security', 'join', 'login', 'watching',
  'new', 'integrations', 'gist', 'business',
  'mirrors', 'open-source', 'personal',
  'pricing'
]
const GH_RESERVED_REPO_NAMES = ['followers', 'following', 'repositories']
const GH_404_SEL = '#parallax_wrapper'
const GH_PJAX_CONTAINER_SEL = '#js-repo-pjax-container, .context-loader-container, [data-pjax-container]'
const GH_CONTAINERS = '.container, .container-responsive'
const GH_RAW_CONTENT = 'body > pre'

class GitHub extends PjaxAdapter {
  constructor() {
    super(['jquery.pjax.js'])
  }

  // @override
  init($sidebar) {
    const pjaxContainer = $(GH_PJAX_CONTAINER_SEL)[0]
    super.init($sidebar, {'pjaxContainer': pjaxContainer})

    // Fix #151 by detecting when page layout is updated.
    // In this case, split-diff page has a wider layout, so need to recompute margin.
    // Note that couldn't do this in response to URL change, since new DOM via pjax might not be ready.
    const diffModeObserver = new window.MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (~mutation.oldValue.indexOf('split-diff') ||
            ~mutation.target.className.indexOf('split-diff')) {
          return $(document).trigger(EVENT.LAYOUT_CHANGE)
        }
      })
    })

    diffModeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true
    })
  }

  // @override
  _getLoginUser() {
    return $('meta[name=user-login]').attr("content");
  }

  // @override
  getCssClass() {
    return 'octotree_github_sidebar'
  }

  // @override
  canLoadEntireTree() {
    return true
  }

  // @override
  getCreateTokenUrl() {
    return `${location.protocol}//${location.host}/settings/tokens/new`
  }

  // @override
  updateLayout(togglerVisible, sidebarVisible, sidebarWidth) {
    const SPACING = 10
    const $containers = $(GH_CONTAINERS)
    const autoMarginLeft = ($(document).width() - $containers.width()) / 2
    const shouldPushLeft = sidebarVisible && (autoMarginLeft <= sidebarWidth + SPACING)

    $('html').css('margin-left', shouldPushLeft ? sidebarWidth : '')
    $containers.css('margin-left', shouldPushLeft ? SPACING : '')
  }

  // @override
  getRepoFromPath(showInNonCodePage, currentRepo, token, cb) {
    // 404 page, skip
    if ($(GH_404_SEL).length) {
      return cb()
    }

    // Skip raw page
    if ($(GH_RAW_CONTENT).length) {
      return cb()
    }

    // (username)/(reponame)[/(type)]
    const match = window.location.pathname.match(/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?/)
    if (!match) {
      return cb()
    }

    const username = match[1]
    const reponame = match[2]

    // Not a repository, skip
    if (~GH_RESERVED_USER_NAMES.indexOf(username) ||
        ~GH_RESERVED_REPO_NAMES.indexOf(reponame)) {
      return cb()
    }

    // Skip non-code page unless showInNonCodePage is true
    if (!showInNonCodePage && match[3] && !~['tree', 'blob'].indexOf(match[3])) {
      return cb()
    }

    // Get branch by inspecting page, quite fragile so provide multiple fallbacks
    const branch =
      // Code page
      $('.branch-select-menu .select-menu-item.selected').data('name') ||
      // Pull requests page
      ($('.commit-ref.base-ref').attr('title') || ':').match(/:(.*)/)[1] ||
      // Reuse last selected branch if exist
      (currentRepo.username === username && currentRepo.reponame === reponame && currentRepo.branch) ||
      // Get default branch from cache
      this._defaultBranch[username + '/' + reponame]

    // Still no luck, get default branch for real
    const repo = {username: username, reponame: reponame, branch: branch}

    if (repo.branch) {
      cb(null, repo)
    }
    else {
      this._get(null, {repo, token}, (err, data) => {
        if (err) return cb(err)
        repo.branch = this._defaultBranch[username + '/' + reponame] = data.default_branch || 'master'
        cb(null, repo)
      })
    }
  }

  // @override
  getRepoFromUrl(url, cb) {
    // (username)/(reponame)[/(type)]
    const match = url.match(/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?/)
    if (!match) { return cb(true) }

    const username = match[1]
    const reponame = match[2]
    const repo = { username: username, reponame: reponame }
    cb(null, repo)
  }

  // @override
  selectFile(path) {
    const $pjaxContainer = $(GH_PJAX_CONTAINER_SEL)
    super.selectFile(path, {'$pjaxContainer': $pjaxContainer})
  }

  // @override
  loadIssues(opts, cb) {
    this._loadIssues(opts, cb)
  }

  // @override
  loadAllIssues(opts, cb) {
    this._loadAllIssues(opts, cb)
  }

  // @override
  loadCodeTree(opts, cb) {
    opts.encodedBranch = encodeURIComponent(decodeURIComponent(opts.repo.branch))
    opts.path = (opts.node && (opts.node.sha || opts.encodedBranch)) ||
      (opts.encodedBranch + '?recursive=1')
    this._loadCodeTree(opts, null, cb)
  }

  // @override
  _getTree(path, opts, cb) {
    this._get(`/git/trees/${path}`, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res.tree)
    })
  }

  // @override
  _getAllUserIssues(opts, cb) {
    opts.absolute_url = true
    this._get(`/user/issues`, opts, (err, res) => {
      if (err) cb(err)
      else {
        res = res.filter((item) => !item.pull_request)
        cb(null, res)
      }
    })
  }

  // @override
  _getIssues(opts, cb) {
    this._get(`/issues`, opts, (err, res) => {
      if (err) cb(err)
      else {
        res = res.filter((item) => !item.pull_request)
        cb(null, res)
      }
    })
  }

  // @override
  _getIssueComments(issue_id, opts, cb) {
    this._get(`/issues/${issue_id}/comments`, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res)
    })
  }

  // @override
  _getIssueReactions(issue_id, opts, cb) {
    opts.media_type = 'application/vnd.github.squirrel-girl-preview'
    this._get(`/issues/${issue_id}/reactions`, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res)
    })
  }

  // @override
  _getIssueEvents(issue_id, opts, cb) {
    this._get(`/issues/${issue_id}/events`, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res)
    })
  }

  // @override
  _getSubmodules(tree, opts, cb) {
    const item = tree.filter((item) => /^\.gitmodules$/i.test(item.path))[0]
    if (!item) return cb()

    this._get(`/git/blobs/${item.sha}`, opts, (err, res) => {
      if (err) return cb(err)
      const data = atob(res.content.replace(/\n/g,''))
      cb(null, parseGitmodules(data))
    })
  }

  // @override
  addIssueReaction(issue_id, reaction_type, opts, cb) {
    opts.media_type = 'application/vnd.github.squirrel-girl-preview'
    this._post(`/issues/${issue_id}/reactions`, {content:reaction_type}, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res)
    })
  }

  // @override
  removeIssueReaction(issue_id, reaction_id, opts, cb) {
    opts.absolute_url = true
    opts.media_type = 'application/vnd.github.squirrel-girl-preview'
    this._delete(`/reactions/${reaction_id}`, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res)
    })
  }

  // @override
  assignMeToIssue(issue_id, opts, cb) {
    const current_user = this._getLoginUser()

    this._post(`/issues/${issue_id}/assignees`, {assignees:[current_user]}, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res)
    })
  }

  // @override
  unAssignMeFromIssue(issue_id, opts, cb) {
    const current_user = this._getLoginUser()
    opts.extra_content = {assignees:[current_user]}

    this._delete(`/issues/${issue_id}/assignees`, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res)
    })
  }

  // @override
  _addIssue(title, opts, cb) {
    this._post(`/issues`, {title:title}, opts, (err, res) => {
      if (err) cb(err)
      else cb(null, res)
    })
  }

  _get(path, opts, cb) {
    const host = location.protocol + '//' + (location.host === 'github.com' ? 'api.github.com' : (location.host + '/api/v3'))

    let url;
    if (opts.absolute_url) url = `${host}${path}`
    else url = `${host}/repos/${opts.repo.username}/${opts.repo.reponame}${path || ''}`

    const cfg  = { url, method: 'GET', cache: false, headers: {} }

    if (opts.token) {
      cfg.headers = { Authorization: 'token ' + opts.token }
    }

    if(opts.media_type) {
      cfg.headers.Accept = opts.media_type
    }

    $.ajax(cfg)
      .done((data) => {
        if (path && path.indexOf('/git/trees') === 0 && data.truncated) {
          this._handleError({status: 206}, cb)
        }
        else cb(null, data)
      })
      .fail((jqXHR) => this._handleError(jqXHR, cb))
  }

  _post(path, params, opts, cb) {
    const host = location.protocol + '//' + (location.host === 'github.com' ? 'api.github.com' : (location.host + '/api/v3'))

    let url;
    if (opts.absolute_url) url = `${host}${path}`
    else url = `${host}/repos/${opts.repo.username}/${opts.repo.reponame}${path || ''}`

    const cfg  = { url, method: 'POST', data: JSON.stringify(params), cache: false, headers: {} }

    if (opts.token) {
      cfg.headers = { Authorization: 'token ' + opts.token }
    }

    if(opts.media_type) {
      cfg.headers.Accept = opts.media_type
    }

    $.ajax(cfg)
      .done((data) => {
        if (path && path.indexOf('/git/trees') === 0 && data.truncated) {
          this._handleError({status: 206}, cb)
        }
        else cb(null, data)
      })
      .fail((jqXHR) => this._handleError(jqXHR, cb))
  }

  _delete(path, opts, cb) {
    const host = location.protocol + '//' + (location.host === 'github.com' ? 'api.github.com' : (location.host + '/api/v3'))

    let url;
    if (opts.absolute_url) url = `${host}${path}`
    else url = `${host}/repos/${opts.repo.username}/${opts.repo.reponame}${path || ''}`

    const cfg  = { url, method: 'DELETE', cache: false, headers: {} }

    if (opts.token) {
      cfg.headers = { Authorization: 'token ' + opts.token }
    }

    if(opts.media_type) {
      cfg.headers.Accept = opts.media_type
    }

    if(opts.extra_content) {
      cfg.data = JSON.stringify(opts.extra_content)
    }

    $.ajax(cfg)
      .done((data) => {
        if (path && path.indexOf('/git/trees') === 0 && data.truncated) {
          this._handleError({status: 206}, cb)
        }
        else cb(null, data)
      })
      .fail((jqXHR) => this._handleError(jqXHR, cb))
  }
}
