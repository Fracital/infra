-- link_routes: which site a domain on the edge's default server leads to (roles/edge_relay,
-- link_routes_enabled). Installed as <openresty conf>/lua/link_routes.lua. README.md "Link
-- routing" has the contract; abulxt's Discord bot is the only writer.
--
-- A request whose Host has no server block of its own lands on 00-edge-relay.conf's default
-- server. Its `location /` calls route(), which looks the Host up here and ngx.exec()s the
-- site's named location: @link_abstract (amph), @link_fracital (Fracital and stomp, picked on terp
-- by X-FRX-App), @link_holy, or @link_holywisp (the placeholder page for a name nobody registered).
--
-- Redis (the edges' shared Redis, edge_redis_host): hash linkroute:v1, field = domain (lowercase,
-- punycode, no trailing dot, no leading www.), value = fracital | stomp | abstract | holy. An
-- entry covers the domain and every name under it; the longest match wins. Field __ready holds
-- the unix time of the writer's last full sync (every 60 s). Without __ready the hash was lost or
-- never written, so a miss means nothing and the answer comes from the stale cache instead.
-- holywisp is never stored: it is only what a miss can be configured to mean.

local M = {}

local HASH = "linkroute:v1"
local READY = "__ready"
-- What the table may hold.
local STORED = { fracital = true, stomp = true, abstract = true, holy = true }
-- What an answer may be: a stored site, or the placeholder.
local TARGETS = { fracital = true, stomp = true, abstract = true, holy = true, holywisp = true }
-- More labels than any real name has; bounds the HMGET.
local MAX_LABELS = 10

local cfg = nil -- set by M.init (init_by_lua, master process)
local dict = nil -- ngx.shared.link_routes

-- ---------------------------------------------------------------- setup

-- init_by_lua. opts: redis {host, port, auth, db, timeout_ms, pool_size}, default_site,
-- unavailable_site, fresh_ttl, stale_ttl, retry_ttl, down_ttl, sites (the targets this box renders
-- a named location for: {fracital = true, ...}; abstract is always there), refuse ({site = path
-- segment}: a request under /<segment>/ that reached location / had a wrong relay key), limits
-- ({site = bytes}: that site's client_max_body_size), assets (the regex of Fracital's cached
-- bundles, fracital_asset_regex).
function M.init(opts)
  opts = opts or {}
  local r = opts.redis or {}
  local c = {
    redis = {
      host = r.host,
      port = tonumber(r.port) or 6379,
      auth = r.auth,
      db = tonumber(r.db) or 0,
      timeout_ms = tonumber(r.timeout_ms) or 200,
      pool_size = tonumber(r.pool_size) or 16,
    },
    fresh_ttl = tonumber(opts.fresh_ttl) or 30,
    stale_ttl = tonumber(opts.stale_ttl) or 86400,
    retry_ttl = tonumber(opts.retry_ttl) or 5,
    down_ttl = tonumber(opts.down_ttl) or 2,
    sites = { abstract = true },
    refuse = {},
    limits = {},
    assets = type(opts.assets) == "string" and opts.assets ~= "" and opts.assets or nil,
  }
  for s, on in pairs(type(opts.sites) == "table" and opts.sites or {}) do
    if TARGETS[s] and on then
      c.sites[s] = true
    end
  end
  for s, seg in pairs(type(opts.refuse) == "table" and opts.refuse or {}) do
    if TARGETS[s] and type(seg) == "string" and seg:match("^[A-Za-z0-9_-]+$") then
      c.refuse[s] = seg
    end
  end
  for s, n in pairs(type(opts.limits) == "table" and opts.limits or {}) do
    if TARGETS[s] and tonumber(n) then
      c.limits[s] = tonumber(n)
    end
  end
  if type(c.redis.host) ~= "string" or c.redis.host == "" then
    error("link_routes: redis.host is required")
  end
  -- A configured site this box cannot serve falls back to amph, the default proxy.
  local function usable(s, name)
    if not TARGETS[s] then
      error("link_routes: " .. name .. " must be one of fracital, stomp, abstract, holy, holywisp")
    end
    return c.sites[s] and s or "abstract"
  end
  c.default_site = usable(opts.default_site or "holywisp", "default_site")
  c.unavailable_site = usable(opts.unavailable_site or "abstract", "unavailable_site")
  cfg = c
end

-- ---------------------------------------------------------------- names

-- The Host as the table keys it: lowercase, no port, no trailing dot, no leading www. nil for
-- anything that is not a plain DNS name (an empty Host, an IPv6 literal, odd bytes).
function M.normalize(host)
  if type(host) ~= "string" then
    return nil
  end
  local h = host:lower():gsub(":%d+$", ""):gsub("%.+$", "")
  h = h:gsub("^www%.", "")
  if h == "" or #h > 253 or not h:match("^[a-z0-9_.-]+$") or h:find("..", 1, true) then
    return nil
  end
  if h:sub(1, 1) == "." then
    return nil
  end
  return h
end

-- The name and each parent that still has a dot, most specific first:
-- a.b.example.com -> a.b.example.com, b.example.com, example.com. A bare TLD is never a key.
function M.candidates(h)
  local out = { h }
  local rest = h
  while #out < MAX_LABELS do
    local dot = rest:find(".", 1, true)
    if not dot then
      break
    end
    rest = rest:sub(dot + 1)
    if not rest:find(".", 1, true) then
      break
    end
    out[#out + 1] = rest
  end
  return out
end

-- First candidate with a stored site wins; values that are not one are skipped (and logged).
-- vals[i] belongs to cands[i]; ngx.null (or nil) is a miss.
function M.pick(cands, vals, default)
  for i = 1, #cands do
    local v = vals[i]
    if type(v) == "string" then
      if STORED[v] then
        return v
      end
      M.log_once("badval", "link_routes: ignoring value '" .. v:sub(1, 32) .. "' for " .. cands[i])
    end
  end
  return default
end

-- ---------------------------------------------------------------- cache and Redis

local function shared()
  if not dict then
    dict = ngx.shared.link_routes
  end
  return dict ~= nil
end

-- At most one line a minute per kind: a Redis outage must not fill the error log.
function M.log_once(kind, msg)
  if shared() and dict:add("log:" .. kind, true, 60) then
    ngx.log(ngx.WARN, msg)
  end
end

-- HMGET linkroute:v1 __ready <cands...>. Returns the values for cands, or nil, an error and
-- whether Redis itself answered (true when only the table is missing).
local function lookup(cands)
  local redis = require("resty.redis")
  local red = redis:new()
  local t = cfg.redis.timeout_ms
  red:set_timeouts(t, t, t)
  local ok, err = red:connect(cfg.redis.host, cfg.redis.port)
  if not ok then
    return nil, "connect: " .. tostring(err)
  end
  if (red:get_reused_times() or 0) == 0 then
    if cfg.redis.auth and cfg.redis.auth ~= "" then
      local oka, aerr = red:auth(cfg.redis.auth)
      if not oka then
        red:close()
        return nil, "auth: " .. tostring(aerr)
      end
    end
    if cfg.redis.db ~= 0 then
      local oks, serr = red:select(cfg.redis.db)
      if not oks then
        red:close()
        return nil, "select: " .. tostring(serr)
      end
    end
  end
  local res, herr = red:hmget(HASH, READY, unpack(cands))
  if type(res) ~= "table" then
    red:close()
    return nil, "hmget: " .. tostring(herr)
  end
  red:set_keepalive(60000, cfg.redis.pool_size)
  if res[1] == ngx.null or res[1] == nil then
    return nil, "no " .. READY .. " in " .. HASH .. " (lost or never synced)", true
  end
  local vals = {}
  for i = 1, #cands do
    vals[i] = res[i + 1]
  end
  return vals
end

-- A site this box renders no named location for is served by amph instead.
local function usable(s)
  return cfg.sites[s] and s or "abstract"
end

-- The site for a Host. Fresh cache (fresh_ttl): no Redis call. Otherwise one HMGET; the answer
-- (a miss is default_site) is cached fresh and as the stale copy (stale_ttl). When Redis fails
-- or has no __ready, the stale copy answers, else unavailable_site, cached for retry_ttl only and
-- without touching the stale copy. When Redis does not answer it is skipped for down_ttl, so an
-- outage costs one timeout every down_ttl, not one per request.
function M.site(host)
  if not cfg or not shared() then
    return "abstract"
  end
  local h = M.normalize(host)
  if not h then
    return cfg.default_site
  end
  local fresh = dict:get("f:" .. h)
  if fresh then
    return usable(fresh)
  end

  local vals, err, answered
  if dict:get("down") then
    err = "redis marked down"
  else
    local cands = M.candidates(h)
    vals, err, answered = lookup(cands)
    if vals then
      local s = M.pick(cands, vals, cfg.default_site)
      dict:set("f:" .. h, s, cfg.fresh_ttl)
      dict:set("s:" .. h, s, cfg.stale_ttl)
      return usable(s)
    end
    if not answered then
      dict:set("down", true, cfg.down_ttl)
    end
  end

  local s = dict:get("s:" .. h) or cfg.unavailable_site
  dict:set("f:" .. h, s, cfg.retry_ttl)
  M.log_once("unavail", "link_routes: " .. tostring(err) .. "; " .. h .. " -> " .. s)
  return usable(s)
end

-- ---------------------------------------------------------------- request

-- access_by_lua in the default :443 server's location /. Every answer leaves for a named location,
-- after what the site's own server block would have answered at the edge: abulxt's www. redirect,
-- its body size limit (nginx checked Content-Length against location /'s, the largest of all), ACME
-- http-01 over :443, and a 403 for a wrong relay key (the keyed path itself matched a location
-- before this one).
function M.route()
  local host = ngx.var.host or ""
  local s = M.site(host)
  if s == "abstract" then
    local apex = host:match("^www%.(.+)$")
    if apex then
      return ngx.redirect("https://" .. apex .. ngx.var.request_uri, 301)
    end
  end
  local limit = cfg and cfg.limits[s]
  local len = tonumber(ngx.var.http_content_length)
  if limit and len and len > limit then
    return ngx.exit(413)
  end
  if s == "abstract" then
    return ngx.exec("@link_abstract")
  end
  local uri = ngx.var.uri or "/"
  if uri:sub(1, 28) == "/.well-known/acme-challenge/" then
    return ngx.exec("@link_acme")
  end
  local seg = cfg.refuse[s]
  if seg and (uri == "/" .. seg or uri:sub(1, #seg + 2) == "/" .. seg .. "/") then
    return ngx.exec("@link_refuse")
  end
  if s == "fracital" or s == "stomp" then
    -- terp's default server picks the app by this header (fracital-origin.conf.j2). Set or
    -- cleared here, so whatever the client sent never reaches terp.
    ngx.req.set_header("X-FRX-App", s == "stomp" and "stomp" or nil)
    if cfg.assets and ngx.re.find(uri, cfg.assets, "jo") then
      return ngx.exec("@link_fracital_assets")
    end
    return ngx.exec("@link_fracital")
  end
  return ngx.exec("@link_" .. s)
end

-- access_by_lua in the default :80 server's location /: abulxt (and a Host Redis cannot answer
-- for) is sent to its apex without www., as before link routing; the other sites keep the Host,
-- as their own :80 servers do.
function M.redirect_https()
  local host = ngx.var.host or ""
  local target = host
  if M.site(host) == "abstract" then
    target = host:match("^www%.(.+)$") or host
  end
  return ngx.redirect("https://" .. target .. ngx.var.request_uri, 301)
end

return M
