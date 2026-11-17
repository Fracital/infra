-- edge_static: render nginx's JSON directory listing as the page giftshop's superbindex.xslt
-- made (2026-11-17 migration): same markup, styles and scripts, so the listing looks and behaves
-- the same (type-to-filter, README.md under the list). Runs only where listing-header.lua marked
-- the response.
local ctx = ngx.ctx
if not ctx.edge_static_listing then
    return
end

local chunk, eof = ngx.arg[1], ngx.arg[2]
if chunk ~= "" then
    ctx.edge_static_buf = ctx.edge_static_buf or {}
    ctx.edge_static_buf[#ctx.edge_static_buf + 1] = chunk
end
if not eof then
    ngx.arg[1] = nil
    return
end

local function esc(s)
    return (s:gsub("[&<>\"']", { ["&"] = "&amp;", ["<"] = "&lt;", [">"] = "&gt;", ['"'] = "&quot;", ["'"] = "&#39;" }))
end

local cjson = require("cjson.safe")
local entries = cjson.decode(table.concat(ctx.edge_static_buf or {})) or {}

local style = [[:root{--color-base00: #FFFFFF;--color-base07: #202020;--color-base0D: #3777E6;--color-base0E: #AD00A1;--theme-background: var(--color-base00);--theme-link-directory: var(--color-base0D);--theme-link-file: var(--color-base07);--theme-link-highlight: var(--color-base0E);--theme-link-hover: var(--color-base0E)}@media(prefers-color-scheme: dark){:root{--color-base00: #2D2D2D;--color-base07: #F2F0EC;--color-base0D: #6699CC;--color-base0E: #CC99CC}}*{box-sizing:border-box}body{margin:3.5rem}html{background-color:var(--theme-background);font-family:SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:100%}.asset-list{display:block;list-style:none;margin:0;padding:0}.asset-item{display:block}.asset-item--directory{color:var(--theme-link-directory)}.asset-item--file{color:var(--theme-link-file)}.asset-item--directory+.asset-item--file{margin-top:1rem}.asset-link{display:block;line-height:1.7;opacity:1;overflow:hidden;text-overflow:ellipsis;transition:color 100ms,opacity 100ms;white-space:nowrap}.asset-link:any-link{color:inherit;text-decoration:none}.asset-link:focus,.asset-link:hover{color:var(--theme-link-hover)}.asset-link:focus{outline:none}.asset-mark{position:relative;background-color:transparent;color:var(--theme-link-highlight);display:inline-block}.asset-mark::before{position:absolute;top:50%;right:0;left:0;background-color:var(--theme-link-highlight);border-radius:1px;content:"";transform:translateY(-50%) translateY(0.5em);width:auto;height:2px}.asset-item--filtered>.asset-link{opacity:.4}.asset-item--filtered>.asset-link:focus,.asset-item--filtered>.asset-link:hover{opacity:1}]]

local elements = [[const CustomElement=ParentClass=>class CustomElement extends ParentClass{static define(){customElements.define(this.tagName,this,{extends:this.tagType})}connectedCallback(){if(this.isConnected&&this.mount instanceof Function){this.mount()}}getCustomElement(customElement){return this.querySelector(`[is="${customElement.tagName}"]`)}};class AssetLink extends(CustomElement(HTMLAnchorElement)){static tagName="asset-link";static tagType="a";highlighted=false;highlight(highlightedGraphemes){const regExp=new RegExp(`^(${highlightedGraphemes})`,"iu");this.highlighted=highlightedGraphemes!==""&&regExp.test(this.name);if(this.highlighted){const template='<mark class="asset-mark">$1</mark>';this.innerHTML=this.name.replace(regExp,template)}else{this.textContent=this.name}this.classList.toggle("asset-link--highlighted",this.highlighted)}get name(){return this.dataset.name}get type(){if(this.classList.contains("asset-link--directory")){return"directory"}if(this.classList.contains("asset-link--file")){return"file"}return""}}class AssetItem extends(CustomElement(HTMLLIElement)){static tagName="asset-item";static tagType="li";link=this.getCustomElement(AssetLink);highlight(highlightedGraphemes){this.link.highlight(highlightedGraphemes);const filtered=highlightedGraphemes===""||this.link.highlighted;this.ariaHidden=filtered?null:true;this.classList.toggle("asset-item--filtered",!filtered)}get highlighted(){return this.link.highlighted}focus(){this.link.focus()}}class AssetList extends(CustomElement(HTMLOListElement)){static tagName="asset-list";static tagType="ol";highlightedGraphemes="";keystroke=this.keystroke.bind(this);highlight(key){if(key===""){this.highlightedGraphemes=""}else{this.highlightedGraphemes+=key.toLocaleLowerCase()}let firstHighlightedAssetItem;for(const assetItem of this.children){assetItem.highlight(this.highlightedGraphemes);if(firstHighlightedAssetItem===undefined&&assetItem.highlighted){firstHighlightedAssetItem=assetItem}}if(firstHighlightedAssetItem===undefined){if(this.highlightedGraphemes!==""){this.highlight("")}return}firstHighlightedAssetItem.focus();firstHighlightedAssetItem.scrollIntoView({behavior:"smooth",block:"nearest"})}mount(){document.body.addEventListener("keyup",this.keystroke)}keystroke({key:key}){if(key==="Escape"){this.highlight("");return}const notGrapheme=key.length!==1;if(notGrapheme){return}this.highlight(key)}}function main(){AssetLink.define();AssetItem.define();AssetList.define()}document.addEventListener("DOMContentLoaded",main);]]

local readme = [[ const md = markdownit(); window.readreq.then(r=>r.ok&&r.text().then(a=> { const lol = document.createElement("div"); lol.style.paddingTop = "100px"; lol.style.color="var(--theme-link-file)"; lol.innerHTML = md.render(a); document.body.append(lol) }  ))  ]]

local out = {
    '<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Method</title>',
    '<meta name="version" content="2.0.1"><meta name="viewport" content="initial-scale=1, shrink-to-fit=no, viewport-fit=cover, width=device-width, height=device-height">',
    '<script>window.readreq = fetch("README.md",{cache:"no-store"})</script>',
    "<style>", style, "</style></head><body>",
    '<ol aria-label="asset list" is="asset-list" class="asset-list">',
}
for _, e in ipairs(entries) do
    local kind = (e.type == "directory" or e.type == "file") and e.type or "other"
    local name = tostring(e.name or "")
    local text = esc(name)
    local href = ngx.escape_uri(name) .. (kind == "directory" and "/" or "")
    out[#out + 1] = '<li is="asset-item" class="asset-item asset-item--' .. kind .. '">'
        .. '<a is="asset-link" aria-label="' .. kind .. " " .. text .. '" data-name="' .. text
        .. '" href="' .. esc(href) .. '" class="asset-link asset-link--' .. kind .. '">' .. text .. "</a></li>"
end
out[#out + 1] = "</ol><script>" .. elements .. "</script>"
out[#out + 1] = '<script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>'
out[#out + 1] = "<script>" .. readme .. "</script></body></html>"

ngx.arg[1] = table.concat(out)
