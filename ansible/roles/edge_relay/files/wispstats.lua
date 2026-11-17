-- wispstats: wisp.baby live usage stats, the box side (roles/edge_relay, wisp boxes only).
-- Installed as <openresty conf>/lua/wispstats.lua. The wire contract (Redis keys, /live, /you) is
-- wispbaby/README.md "Live stats".
--
-- What it does, all of it in this OpenResty:
--   * counts relay sessions at the WebSocket upgrade (header filter, status 101) and their bytes at
--     close (log phase), under a salted HMAC of the client address, in hourly buckets in
--     ngx.shared.wispstats_you that expire after 25 h. Raw addresses are never stored.
--   * queues each hash once a UTC day for the HyperLogLog of distinct clients on amph.
--   * counts the :80 speed test endpoint's bytes, and relay sessions (total and open) box-wide and
--     per domain tag (the relay route a session came in on: the template passes it to relay_open).
--   * splits holyWisp's box-wide byte counters across the domain tags every tick (see attribute()).
--   * once every 2 s (worker 0 only): reads holyWisp's loopback /stats, writes this box's counters
--     and the queued hashes to amph's Redis, and reads back the collector's blobs, all in one
--     pipelined round trip. /live and /live/history are served from shared memory, so a page poll
--     never reaches Redis or Postgres.
--   * answers /you: the visitor's address, GeoIP city (DB-IP City Lite through libmaxminddb), the
--     kernel's TCP RTT for their connection and their last 24 h on this box.

local cjson = require("cjson.safe")
local ffi = require("ffi")

local M = {}

local cfg = nil        -- set by M.init (init_by_lua, master process)
local stats = nil      -- ngx.shared.wispstats: blobs, speed test counter, the HLL queue
local you = nil        -- ngx.shared.wispstats_you: per-hash hourly buckets, open sessions, seen-today

local HOUR = 3600
local BUCKET_TTL = 25 * HOUR
local HLL_TTL = 35 * 86400
local HLLQ_MAX = 200000       -- hashes waiting for the next push; beyond this the oldest are dropped
local HLLQ_BATCH = 5000       -- hashes per push
local STALE_S = 10            -- /live is "stale" when the last fresh blob is older than this
local HISTORY_EVERY = 15      -- ticks between history reads (about 30 s)

local HW_FIELDS = { "uptime", "conn_total", "conn_active", "streams_total", "streams_active",
  "bytes_in", "bytes_out" }

-- ---------------------------------------------------------------- setup

-- init_by_lua: read the config file (root-only: it holds the Redis password and the salt).
function M.init(path)
  local f, err = io.open(path, "rb")
  if not f then
    error("wispstats: cannot read " .. path .. ": " .. tostring(err))
  end
  local body = f:read("*a")
  f:close()
  local c = cjson.decode(body)
  if type(c) ~= "table" or type(c.site) ~= "string" or type(c.salt) ~= "string" or #c.salt < 16 then
    error("wispstats: " .. path .. " needs site and salt (16+ chars)")
  end
  c.interval = tonumber(c.interval) or 2
  c.holywisp_port = tonumber(c.holywisp_port) or 6001
  c.redis = c.redis or {}
  c.redis.port = tonumber(c.redis.port) or 6379
  c.redis.db = tonumber(c.redis.db) or 0
  -- Domain tags: the ones this box reports (always ending with "other"), and the Hosts that pick
  -- their own tag on a route opened with by_host (a Fracital origin app such as stomp).
  local tags, known = {}, {}
  for _, t in ipairs(type(c.tags) == "table" and c.tags or {}) do
    if type(t) == "string" and t:match("^[a-z0-9]+$") and #t <= 24 and t ~= "other" and not known[t] then
      tags[#tags + 1] = t
      known[t] = true
    end
  end
  tags[#tags + 1] = "other"
  known.other = true
  c.tags, c.known_tags = tags, known
  local host_tags = {}
  for h, t in pairs(type(c.host_tags) == "table" and c.host_tags or {}) do
    if type(h) == "string" and known[t] then
      host_tags[h:lower()] = t
    end
  end
  c.host_tags = host_tags
  cfg = c
end

local function shared()
  if not stats then
    stats = ngx.shared.wispstats
    you = ngx.shared.wispstats_you
  end
  return stats ~= nil and you ~= nil
end

-- ---------------------------------------------------------------- client hashes

local function client_hash(addr)
  -- HMAC-SHA1(salt, address), first 12 bytes, base64: 16 characters. The same salt on every box,
  -- so one client seen on two boxes is one element of the HyperLogLog.
  return ngx.encode_base64(ngx.hmac_sha1(cfg.salt, addr):sub(1, 12))
end

local function hour_now()
  return math.floor(ngx.time() / HOUR)
end

local function utc_day(t)
  return os.date("!%Y%m%d", t or ngx.time())
end

-- ---------------------------------------------------------------- relay hooks

-- header_filter_by_lua in every relay location: a 101 is a Wisp session starting. tag is the route's
-- domain tag; with by_host, a Host listed in host_tags (a Fracital origin app) picks its own.
function M.relay_open(tag, by_host)
  if not cfg or ngx.status ~= 101 or not shared() then
    return
  end
  local ok, h = pcall(client_hash, ngx.var.remote_addr or "")
  if not ok then
    return
  end
  if by_host then
    tag = cfg.host_tags[(ngx.var.host or ""):lower()] or tag
  end
  if not cfg.known_tags[tag] then
    tag = "other"
  end
  ngx.ctx.wispstats_hash = h
  ngx.ctx.wispstats_tag = tag
  -- Sessions are counted here, not from holyWisp's connections: holyWisp also counts the box's
  -- own /stats polls and any /health check as connections.
  stats:incr("ws_total", 1, 0)
  stats:incr("ws_active", 1, 0)
  stats:incr("d.ws_total:" .. tag, 1, 0)
  stats:incr("d.ws_active:" .. tag, 1, 0)
  local hr = hour_now()
  you:incr("o:" .. h, 1, 0, 2 * 86400)
  you:incr("s:" .. hr .. ":" .. h, 1, 0, BUCKET_TTL)
  local day = utc_day()
  if you:add("d:" .. day .. ":" .. h, true, 26 * HOUR) then
    local len = stats:lpush("hllq", day .. ":" .. h)
    if len and len > HLLQ_MAX then
      stats:rpop("hllq")
    end
  end
end

-- log_by_lua in the same locations: the session ended. Down is what this server sent the client,
-- up is what it passed on to holyWisp (both include the upgraded WebSocket traffic).
function M.relay_close()
  local h = ngx.ctx.wispstats_hash
  if not h or not shared() then
    return
  end
  local active = stats:incr("ws_active", -1, 0)
  if active and active < 0 then
    stats:set("ws_active", 0)
  end
  local tag = ngx.ctx.wispstats_tag or "other"
  local dactive = stats:incr("d.ws_active:" .. tag, -1, 0)
  if dactive and dactive < 0 then
    stats:set("d.ws_active:" .. tag, 0)
  end
  local left = you:incr("o:" .. h, -1, 0, 2 * 86400)
  if left and left <= 0 then
    you:delete("o:" .. h)
  end
  local down = tonumber(ngx.var.bytes_sent) or 0
  local up = 0
  for n in tostring(ngx.var.upstream_bytes_sent or ""):gmatch("%d+") do
    up = up + tonumber(n)
  end
  local total = down + up
  if total > 0 then
    you:incr("b:" .. hour_now() .. ":" .. h, total, 0, BUCKET_TTL)
  end
  -- Exact bytes and length of the finished session: what attribute() learns each tag's rate from.
  local secs = ngx.now() - (ngx.req.start_time() or ngx.now())
  stats:incr("d.cb:" .. tag, total, 0)
  stats:incr("d.cs:" .. tag, math.max(secs, 1), 0)
end

-- log_by_lua on :80 /speedtest/range/: bytes the speed test moved (down: the response, up: the POST
-- body, which is all of request_length but the head).
function M.speedtest_log()
  if not shared() then
    return
  end
  local n = (tonumber(ngx.var.bytes_sent) or 0) + (tonumber(ngx.var.request_length) or 0)
  if n > 0 then
    stats:incr("st_bytes", n, 0)
  end
end

-- ---------------------------------------------------------------- the 2 s push

local function holywisp_stats()
  local sock = ngx.socket.tcp()
  sock:settimeouts(500, 500, 1000)
  local ok = sock:connect("127.0.0.1", cfg.holywisp_port)
  if not ok then
    return nil
  end
  ok = sock:send("GET /stats HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
  if not ok then
    sock:close()
    return nil
  end
  local res = sock:receive("*a")
  sock:close()
  if not res then
    return nil
  end
  local status = res:match("^HTTP/1%.%d (%d%d%d)")
  local body = res:match("\r\n\r\n(.*)$")
  if status ~= "200" or not body then
    return nil
  end
  local j = cjson.decode(body)
  if type(j) ~= "table" or type(j.bytes) ~= "table" or type(j.connections) ~= "table" then
    return nil
  end
  local streams = type(j.streams) == "table" and j.streams or {}
  local function n(v)
    v = tonumber(v)
    return v and string.format("%.0f", v) or "0"
  end
  return {
    uptime = n(j.uptimeSeconds),
    conn_total = n(j.connections.total),
    conn_active = n(j.connections.active),
    streams_total = n(streams.total),
    streams_active = n(streams.active),
    bytes_in = n(j.bytes["in"]),
    bytes_out = n(j.bytes.out),
  }
end

local function take_hllq()
  local items = {}
  for _ = 1, HLLQ_BATCH do
    local v = stats:rpop("hllq")
    if not v then
      break
    end
    items[#items + 1] = v
  end
  return items
end

local function give_back_hllq(items)
  -- Back to the far end, so they go out first next time.
  for i = #items, 1, -1 do
    stats:rpush("hllq", items[i])
  end
end

-- ---------------------------------------------------------------- bytes by domain tag

-- holyWisp only counts bytes box-wide, and OpenResty only knows a WebSocket's bytes once it closes.
-- So each tick, holyWisp's delta is split across the tags in proportion to
-- open sessions x that tag's rate, the rate being the bytes per session-second of its recently
-- closed sessions (exact, decayed with a 10 min half-life). With nothing open, the split follows
-- the sessions that closed this tick; with nothing at all, the bytes go to "other". The tags always
-- add up to the box. The cumulative results live in shared memory (d.down:<tag>, d.up:<tag>), so a
-- reload keeps them; an OpenResty restart zeroes them along with st_epoch.
local HALF_LIFE_S = 600
local learned = {}    -- worker 0 only: tag -> { b = decayed bytes, s = decayed seconds, pb, ps }

local function hw_delta(name, cur, restarted)
  local key = "hw_prev:" .. name
  local prev = stats:get(key)
  stats:set(key, cur)
  if not prev then
    return 0
  end
  if restarted or cur < prev then
    return cur
  end
  return cur - prev
end

local function attribute(hw)
  local uptime = tonumber(hw.uptime) or 0
  local prev_up = stats:get("hw_prev:uptime")
  stats:set("hw_prev:uptime", uptime)
  local restarted = prev_up ~= nil and uptime < prev_up
  local d_down = hw_delta("out", tonumber(hw.bytes_out) or 0, restarted)
  local d_up = hw_delta("in", tonumber(hw.bytes_in) or 0, restarted)

  local decay = 0.5 ^ (cfg.interval / HALF_LIFE_S)
  local weights, closed = {}, {}
  local wsum, csum, all_b, all_s = 0, 0, 0, 0
  for _, t in ipairs(cfg.tags) do
    local cb, cs = stats:get("d.cb:" .. t) or 0, stats:get("d.cs:" .. t) or 0
    local l = learned[t]
    if not l then
      l = { b = 0, s = 0, pb = cb, ps = cs }
      learned[t] = l
    end
    local db, ds = cb - l.pb, cs - l.ps
    if db < 0 or ds < 0 then -- the counters restarted
      db, ds = 0, 0
    end
    l.pb, l.ps = cb, cs
    l.b, l.s = l.b * decay + db, l.s * decay + ds
    closed[t] = db
    csum = csum + db
    all_b, all_s = all_b + l.b, all_s + l.s
  end
  local fallback = all_s > 0 and all_b / all_s or 1
  for _, t in ipairs(cfg.tags) do
    local l = learned[t]
    local rate = l.s > 0 and l.b / l.s or fallback
    local w = math.max(0, stats:get("d.ws_active:" .. t) or 0) * math.max(rate, 1e-9)
    weights[t] = w
    wsum = wsum + w
  end
  if wsum <= 0 then
    weights, wsum = closed, csum
  end
  if wsum <= 0 then
    weights, wsum = { other = 1 }, 1
  end
  if d_down <= 0 and d_up <= 0 then
    return
  end
  for t, w in pairs(weights) do
    if w > 0 then
      stats:incr("d.down:" .. t, math.max(d_down, 0) * w / wsum, 0)
      stats:incr("d.up:" .. t, math.max(d_up, 0) * w / wsum, 0)
    end
  end
end

local function domain_fields(fields)
  fields[#fields + 1] = "dtags"
  fields[#fields + 1] = table.concat(cfg.tags, ",")
  for _, t in ipairs(cfg.tags) do
    local p = "d." .. t .. "."
    fields[#fields + 1] = p .. "down"
    fields[#fields + 1] = string.format("%.0f", math.floor(stats:get("d.down:" .. t) or 0))
    fields[#fields + 1] = p .. "up"
    fields[#fields + 1] = string.format("%.0f", math.floor(stats:get("d.up:" .. t) or 0))
    fields[#fields + 1] = p .. "ws_total"
    fields[#fields + 1] = string.format("%.0f", stats:get("d.ws_total:" .. t) or 0)
    fields[#fields + 1] = p .. "ws_active"
    fields[#fields + 1] = string.format("%.0f", math.max(0, stats:get("d.ws_active:" .. t) or 0))
  end
end

local ticks = 0
local busy = false

local function tick(premature)
  if premature or busy then
    return
  end
  busy = true
  ticks = ticks + 1
  local ok, err = pcall(function()
    local hw = holywisp_stats()
    local now_ms = string.format("%.0f", ngx.now() * 1000)
    local key = "wispbaby:box:" .. cfg.site
    local fields = {
      "ts", now_ms, "city", cfg.city or "", "country", cfg.country or "",
      "hw", hw and "1" or "0",
      "st_bytes", string.format("%.0f", stats:get("st_bytes") or 0),
      "st_epoch", string.format("%.0f", stats:get("st_epoch") or 0),
      "ws_total", string.format("%.0f", stats:get("ws_total") or 0),
      "ws_active", string.format("%.0f", math.max(0, stats:get("ws_active") or 0)),
    }
    if hw then
      for _, f in ipairs(HW_FIELDS) do
        fields[#fields + 1] = f
        fields[#fields + 1] = hw[f]
      end
      attribute(hw)
    end
    domain_fields(fields)

    local hll = take_hllq()
    local byday = {}
    for _, v in ipairs(hll) do
      local day, h = v:match("^(%d+):(.+)$")
      if day then
        byday[day] = byday[day] or {}
        table.insert(byday[day], h)
      end
    end

    local redis = require("resty.redis")
    local red = redis:new()
    red:set_timeouts(1000, 1000, 1000)
    local okc, cerr = red:connect(cfg.redis.host, cfg.redis.port)
    if not okc then
      give_back_hllq(hll)
      error("redis connect: " .. tostring(cerr))
    end
    if (red:get_reused_times() or 0) == 0 then
      if cfg.redis.password and cfg.redis.password ~= "" then
        local oka, aerr = red:auth(cfg.redis.password)
        if not oka then
          red:close()
          give_back_hllq(hll)
          error("redis auth: " .. tostring(aerr))
        end
      end
      if cfg.redis.db ~= 0 then
        red:select(cfg.redis.db)
      end
    end

    local want_history = (ticks % HISTORY_EVERY == 1) or not stats:get("history")
    red:init_pipeline()
    red:hset(key, unpack(fields))
    if not hw then
      red:hdel(key, unpack(HW_FIELDS))
    end
    red:expire(key, 30)
    for day, hs in pairs(byday) do
      red:pfadd("wispbaby:hll:" .. day, unpack(hs))
      red:expire("wispbaby:hll:" .. day, HLL_TTL)
    end
    red:get("wispbaby:live")
    if want_history then
      red:get("wispbaby:history")
    end
    local res, perr = red:commit_pipeline()
    if not res then
      red:close()
      give_back_hllq(hll)
      error("redis pipeline: " .. tostring(perr))
    end
    red:set_keepalive(60000, 2)

    local n = #res
    local live, history
    if want_history then
      live, history = res[n - 1], res[n]
    else
      live = res[n]
    end
    if type(live) == "string" and live:sub(1, 1) == "{" then
      stats:set("live", live)
      stats:set("live_at", ngx.now())
    end
    if type(history) == "string" and history:sub(1, 1) == "{" then
      stats:set("history", history)
    end
  end)
  busy = false
  if not ok then
    -- At most one line a minute: a Redis outage must not fill the error log.
    if stats:add("errlog", true, 60) then
      ngx.log(ngx.WARN, "wispstats: ", tostring(err))
    end
  end
end

-- init_worker_by_lua: worker 0 pushes.
function M.init_worker()
  if not cfg or not shared() then
    return
  end
  stats:add("st_epoch", math.floor(ngx.now() * 1000))
  if ngx.worker.id() ~= 0 then
    return
  end
  local ok, err = ngx.timer.every(cfg.interval, tick)
  if not ok then
    ngx.log(ngx.ERR, "wispstats: timer: ", err)
  end
end

-- ---------------------------------------------------------------- GeoIP (libmaxminddb)

-- The structs are declared as libmaxminddb 1.x lays them out on 64-bit Linux (MMDB_s is only ever
-- handled by pointer, so it is an opaque block bigger than the real one). The 128-bit member of
-- the entry data union makes the union 16-byte aligned.
ffi.cdef([[
typedef struct { uint8_t opaque[4096]; } wb_mmdb_s;
typedef struct { const wb_mmdb_s *mmdb; uint32_t offset; } wb_mmdb_entry_s;
typedef struct { bool found_entry; wb_mmdb_entry_s entry; uint16_t netmask; } wb_mmdb_lookup_result_s;
typedef struct { uint64_t lo, hi; } __attribute__((aligned(16))) wb_u128;
typedef struct {
  bool has_data;
  union {
    uint32_t pointer; const char *utf8_string; double double_value; const uint8_t *bytes;
    uint16_t uint16; uint32_t uint32; int32_t int32; uint64_t uint64; wb_u128 uint128;
    bool boolean; float float_value;
  };
  uint32_t offset; uint32_t offset_to_next; uint32_t data_size; uint32_t type;
} wb_mmdb_entry_data_s;
int MMDB_open(const char *filename, uint32_t flags, wb_mmdb_s *mmdb);
wb_mmdb_lookup_result_s MMDB_lookup_string(const wb_mmdb_s *mmdb, const char *ipstr, int *gai_error, int *mmdb_error);
int MMDB_get_value(wb_mmdb_entry_s *start, wb_mmdb_entry_data_s *entry_data, ...);
]])

local MMDB_MODE_MMAP = 1
local MMDB_TYPE_UTF8 = 2
local geo_lib, geo_db = nil, nil
local geo_failed = false

local function geo_open()
  if geo_db or geo_failed then
    return geo_db
  end
  if not cfg.mmdb or cfg.mmdb == "" then
    geo_failed = true
    return nil
  end
  local ok, lib = pcall(ffi.load, "maxminddb")
  if not ok then
    ok, lib = pcall(ffi.load, "libmaxminddb.so.0")
  end
  if not ok then
    ngx.log(ngx.WARN, "wispstats: libmaxminddb not loadable: ", tostring(lib))
    geo_failed = true
    return nil
  end
  local db = ffi.new("wb_mmdb_s")
  if lib.MMDB_open(cfg.mmdb, MMDB_MODE_MMAP, db) ~= 0 then
    ngx.log(ngx.WARN, "wispstats: cannot open ", cfg.mmdb)
    geo_failed = true
    return nil
  end
  geo_lib, geo_db = lib, db
  return db
end

local NULL = ffi.cast("const char *", nil)

local function geo_string(entry, data, ...)
  if geo_lib.MMDB_get_value(entry, data, ...) ~= 0 then
    return nil
  end
  if not data.has_data or data.type ~= MMDB_TYPE_UTF8 or data.data_size == 0 or data.data_size > 200 then
    return nil
  end
  return ffi.string(data.utf8_string, data.data_size)
end

function M.geo(addr)
  local db = geo_open()
  if not db then
    return nil, nil
  end
  local gai, merr = ffi.new("int[1]"), ffi.new("int[1]")
  local res = geo_lib.MMDB_lookup_string(db, addr, gai, merr)
  if gai[0] ~= 0 or merr[0] ~= 0 or not res.found_entry then
    return nil, nil
  end
  local entry = ffi.new("wb_mmdb_entry_s", res.entry)
  local data = ffi.new("wb_mmdb_entry_data_s")
  local city = geo_string(entry, data, "city", "names", "en", NULL)
  local country = geo_string(entry, data, "country", "iso_code", NULL)
  return city, country
end

-- ---------------------------------------------------------------- endpoints

local function send_json(status, body, cache)
  ngx.status = status
  ngx.header["Content-Type"] = "application/json"
  ngx.header["Cache-Control"] = cache
  ngx.print(body)
  return ngx.exit(status)
end

-- GET /live: the collector's blob, with when this box served it and whether it is stale.
function M.serve_live()
  if not shared() then
    return send_json(503, '{"v":1,"stale":true}', "no-store")
  end
  local blob = stats:get("live")
  if not blob then
    return send_json(503, '{"v":1,"stale":true}', "no-store")
  end
  local at = stats:get("live_at") or 0
  local stale = (ngx.now() - at) > STALE_S
  local head = string.format('{"served":%.0f,"stale":%s,', ngx.now() * 1000, stale and "true" or "false")
  return send_json(200, head .. blob:sub(2), "public, max-age=1")
end

-- GET /live/history
function M.serve_history()
  local blob = shared() and stats:get("history")
  if not blob then
    return send_json(503, '{"v":1}', "no-store")
  end
  return send_json(200, blob, "public, max-age=30")
end

-- GET /you: this visitor, this box. Never cached, never logged.
function M.serve_you()
  if not cfg or not shared() then
    return send_json(503, '{"v":1}', "no-store")
  end
  local addr = ngx.var.remote_addr or ""
  local h = client_hash(addr)
  local okg, city, country = pcall(M.geo, addr)
  if not okg then
    city, country = nil, nil
  end
  local hr = hour_now()
  local bytes, sessions = 0, 0
  for i = 0, 23 do
    bytes = bytes + (you:get("b:" .. (hr - i) .. ":" .. h) or 0)
    sessions = sessions + (you:get("s:" .. (hr - i) .. ":" .. h) or 0)
  end
  local rtt = tonumber(ngx.var.tcpinfo_rtt)
  local body = cjson.encode({
    v = 1,
    ip = addr,
    city = city or cjson.null,
    country = country or cjson.null,
    site = cfg.site,
    rttMs = rtt and math.floor(rtt / 100 + 0.5) / 10 or cjson.null,
    openSessions = math.max(0, you:get("o:" .. h) or 0),
    day = { bytes = bytes, sessions = sessions },
  })
  return send_json(200, body, "no-store")
end

return M
