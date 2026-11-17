-- Tests for files/link_routes.lua, outside OpenResty: ngx, its shared dict and resty.redis are
-- stubbed. Run from the repository root: luajit ansible/roles/edge_relay/tests/link_routes_test.lua

package.path = "ansible/roles/edge_relay/files/?.lua;" .. package.path

local now = 1000
local logs = {}

local function new_dict()
  local d = { data = {} }
  local function live(k)
    local e = d.data[k]
    if e and (not e.exp or e.exp > now) then
      return e
    end
    d.data[k] = nil
  end
  function d:get(k)
    local e = live(k)
    return e and e.v
  end
  function d:set(k, v, ttl)
    self.data[k] = { v = v, exp = (ttl and ttl > 0) and now + ttl or nil }
    return true
  end
  function d:add(k, v, ttl)
    if live(k) then
      return false
    end
    return self:set(k, v, ttl)
  end
  return d
end

local NULL = setmetatable({}, { __tostring = function() return "null" end })

_G.ngx = {
  null = NULL,
  WARN = "warn",
  HTTP_FORBIDDEN = 403,
  shared = { link_routes = new_dict() },
  var = {},
  log = function(_, msg) logs[#logs + 1] = msg end,
  exec = function(loc) return "exec:" .. loc end,
  exit = function(code) return "exit:" .. code end,
  redirect = function(url, code) return "redirect:" .. code .. ":" .. url end,
  req = {
    set_header = function(k, v) ngx.var["http_" .. k:lower():gsub("-", "_")] = v end,
  },
  -- Enough of ngx.re for fracital_asset_regex: a Lua pattern of the same shape.
  re = {
    find = function(s)
      return s:match("^/assets/[%w_-]+%.%a+$") and 1 or nil
    end,
  },
}

-- resty.redis stub: `redis_state` decides what the next lookup sees.
local redis_state = { up = true, hash = {}, calls = 0, last_args = nil }
package.preload["resty.redis"] = function()
  local R = {}
  function R.new()
    local o = {}
    function o:set_timeouts() end
    function o:connect()
      if not redis_state.up then
        return nil, "timeout"
      end
      return true
    end
    function o:get_reused_times() return 0 end
    function o:auth(p)
      redis_state.auth = p
      return "OK"
    end
    function o:hmget(key, ...)
      redis_state.calls = redis_state.calls + 1
      redis_state.last_args = { key, ... }
      local out = {}
      for i, f in ipairs({ ... }) do
        local v = redis_state.hash[f]
        out[i] = v == nil and NULL or v
      end
      return out
    end
    function o:set_keepalive() return true end
    function o:close() end
    return o
  end
  return R
end

local lr = require("link_routes")

local failures, count = 0, 0
local function eq(got, want, what)
  count = count + 1
  if got ~= want then
    failures = failures + 1
    io.stderr:write(("FAIL %s: got %s, want %s\n"):format(what, tostring(got), tostring(want)))
  end
end

local function reset(opts)
  now = 1000
  logs = {}
  -- Emptied, not replaced: the module keeps its first handle on the dict, as in a worker.
  ngx.shared.link_routes.data = {}
  redis_state.up = true
  redis_state.calls = 0
  redis_state.hash = { __ready = "999" }
  lr.init(opts or {
    redis = { host = "10.0.0.1", port = 6379, auth = "pw" },
    default_site = "holywisp",
    unavailable_site = "abstract",
    sites = { fracital = true, stomp = true, holy = true, holywisp = true },
    refuse = { fracital = "pipe", stomp = "pipe", holy = "wisp" },
    limits = { abstract = 16, fracital = 100, stomp = 100, holy = 100 },
    assets = "^/assets/...",
  })
end

-- normalize
eq(lr.normalize("WWW.Example.COM."), "example.com", "lowercase, www., trailing dot")
eq(lr.normalize("example.com:443"), "example.com", "port")
eq(lr.normalize("www.www.example.com"), "www.example.com", "only one www.")
eq(lr.normalize("wwwexample.com"), "wwwexample.com", "www without a dot stays")
eq(lr.normalize(""), nil, "empty")
eq(lr.normalize(nil), nil, "nil")
eq(lr.normalize("[::1]"), nil, "IPv6 literal")
eq(lr.normalize("a..b.com"), nil, "empty label")
eq(lr.normalize(".example.com"), nil, "leading dot")
eq(lr.normalize("xn--bcher-kva.example"), "xn--bcher-kva.example", "punycode")

-- candidates
local c = lr.candidates("a.b.example.com")
eq(#c, 3, "candidate count")
eq(c[1], "a.b.example.com", "most specific first")
eq(c[2], "b.example.com", "parent")
eq(c[3], "example.com", "registrable name, no bare TLD")
eq(#lr.candidates("example.com"), 1, "apex has no parents")
eq(#lr.candidates("localhost"), 1, "single label")
eq(#lr.candidates(("x."):rep(20) .. "com"), 10, "bounded")

-- pick
eq(lr.pick({ "a.x.com", "x.com" }, { NULL, "holy" }, "fracital"), "holy", "parent match")
eq(lr.pick({ "x.com" }, { "holywisp" }, "abstract"), "abstract", "holywisp is never a stored value")
eq(lr.pick({ "a.x.com", "x.com" }, { "stomp", "holy" }, "fracital"), "stomp", "longest match wins")
eq(lr.pick({ "a.x.com", "x.com" }, { "bogus", "abstract" }, "fracital"), "abstract", "bad value skipped")
eq(lr.pick({ "x.com" }, { NULL }, "fracital"), "fracital", "miss is the default")

-- site: lookups, cache
reset()
redis_state.hash["example.com"] = "abstract"
eq(lr.site("shop.example.com"), "abstract", "subdomain of a registered name")
eq(redis_state.auth, "pw", "auth sent")
eq(redis_state.last_args[1], "linkroute:v1", "hash name")
eq(redis_state.last_args[2], "__ready", "sentinel asked first")
eq(lr.site("shop.example.com"), "abstract", "cached")
eq(redis_state.calls, 1, "fresh hit makes no Redis call")
eq(lr.site("unknown.test"), "holywisp", "unregistered goes to the default (placeholder)")
now = now + 31
redis_state.hash["example.com"] = "holy"
eq(lr.site("shop.example.com"), "holy", "fresh entry expired, new answer")

-- Redis down: stale copy, else unavailable_site; the stale copy is never overwritten
reset()
redis_state.hash["example.com"] = "stomp"
eq(lr.site("example.com"), "stomp", "warm the cache")
now = now + 31
redis_state.up = false
eq(lr.site("example.com"), "stomp", "Redis down: stale copy")
eq(lr.site("never-seen.test"), "abstract", "Redis down, no stale copy: unavailable_site")
eq(#logs, 1, "one log line for the outage")
redis_state.up = true
now = now + 3 -- past down_ttl, inside retry_ttl
eq(lr.site("never-seen.test"), "abstract", "outage answer reused for retry_ttl")
now = now + 3
eq(lr.site("never-seen.test"), "holywisp", "after retry_ttl, asked again")
eq(ngx.shared.link_routes:get("s:example.com"), "stomp", "stale copy kept")

-- Table evicted (no __ready): a miss is not trusted
reset()
redis_state.hash["example.com"] = "holy"
eq(lr.site("example.com"), "holy", "warm the cache")
now = now + 31
redis_state.hash = {}
eq(lr.site("example.com"), "holy", "no __ready: stale copy")
eq(lr.site("other.test"), "abstract", "no __ready, no stale copy: unavailable_site")
eq(ngx.shared.link_routes:get("down"), nil, "Redis answered: not marked down")

-- Disabled targets fall back to amph
reset({
  redis = { host = "10.0.0.1" },
  default_site = "holywisp",
  sites = { fracital = false, stomp = false, holy = false },
})
eq(lr.site("anything.test"), "abstract", "default site not rendered: amph")
redis_state.hash["h.test"] = "holy"
eq(lr.site("h.test"), "abstract", "holy off: amph")

-- route
reset()
redis_state.hash["f.test"] = "fracital"
redis_state.hash["h.test"] = "holy"
redis_state.hash["a.test"] = "abstract"
redis_state.hash["s.test"] = "stomp"
local function route(host, uri, hdr)
  ngx.var = { host = host, uri = uri, request_uri = uri }
  for k, v in pairs(hdr or {}) do
    ngx.var[k] = v
  end
  return lr.route()
end
eq(route("a.test", "/"), "exec:@link_abstract", "abstract goes to amph")
eq(route("a.test", "/pipe/x"), "exec:@link_abstract", "abstract keeps its paths")
eq(route("www.a.test", "/x?y"), "redirect:301:https://a.test/x?y", "abstract www. to the apex")
eq(route("www.f.test", "/"), "exec:@link_fracital", "fracital keeps www.")
eq(route("a.test", "/", { http_content_length = "17" }), "exit:413", "abstract body limit")
eq(route("f.test", "/", { http_content_length = "17" }), "exec:@link_fracital", "fracital's larger limit")
eq(route("f.test", "/", { http_x_frx_app = "stomp" }), "exec:@link_fracital", "fracital")
eq(ngx.var.http_x_frx_app, nil, "client's X-FRX-App removed for fracital")
eq(route("s.test", "/"), "exec:@link_fracital", "stomp shares the Fracital location")
eq(ngx.var.http_x_frx_app, "stomp", "X-FRX-App set for stomp")
eq(route("f.test", "/assets/abcdef12.js"), "exec:@link_fracital_assets", "bundles to the cache location")
eq(route("nobody.test", "/anything"), "exec:@link_holywisp", "unregistered: placeholder")
eq(route("f.test", "/pipe/wrong/"), "exec:@link_refuse", "fracital wrong key")
eq(route("f.test", "/pipe"), "exec:@link_refuse", "fracital bare segment")
eq(route("f.test", "/pipeline"), "exec:@link_fracital", "segment prefix only")
eq(route("h.test", "/wisp/wrong/"), "exec:@link_refuse", "holy wrong key")
eq(route("h.test", "/.well-known/acme-challenge/tok"), "exec:@link_acme", "ACME over 443")
ngx.var = { host = "www.a.test", request_uri = "/p" }
eq(lr.redirect_https(), "redirect:301:https://a.test/p", ":80 abstract loses www.")
ngx.var = { host = "www.f.test", request_uri = "/p" }
eq(lr.redirect_https(), "redirect:301:https://www.f.test/p", ":80 fracital keeps www.")

local ok, err = pcall(lr.init, { redis = { host = "h" }, default_site = "nope" })
eq(ok, false, "bad default_site rejected")
eq(err ~= nil and err:find("default_site") ~= nil, true, "error names the option")

if failures > 0 then
  io.stderr:write(("%d of %d checks failed\n"):format(failures, count))
  os.exit(1)
end
print(("link_routes: %d checks passed"):format(count))
