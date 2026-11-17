-- edge_static: mark nginx's JSON directory listing for listing-body.lua. A URI that ends in "/"
-- is answered either by index.html (text/html) or by autoindex, so JSON there is the listing.
if ngx.status == 200 and ngx.var.uri:sub(-1) == "/"
    and (ngx.header.content_type or ""):find("^application/json") then
    ngx.ctx.edge_static_listing = true
    ngx.header.content_type = "text/html; charset=utf-8"
    ngx.header.content_length = nil
end
