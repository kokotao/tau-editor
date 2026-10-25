# 账户文档云存储 端到端接口冒烟（仓库版，可复现）
# 用途：后端部署后快速验证 P0–P8 全链路（登录/云文档 CRUD/版本/冲突/发布/撤回/角色/公网可见性/跨设备一致性）
# 前置：lizi 后端已启动；测试账号已存在（默认 tau_admin=管理员、tau_user=普通用户，密码由环境变量提供）
# 用法：
#   $env:SMOKE_ADMIN_PASSWORD='***'; $env:SMOKE_USER_PASSWORD='***'
#   powershell -ExecutionPolicy Bypass -File scripts/smoke-cloud-doc.ps1 -Base http://127.0.0.1:19090/lizi
param(
    [string]$Base = 'http://127.0.0.1:19090/lizi',
    [string]$AdminUser = 'tau_admin',
    [string]$AdminPass = $env:SMOKE_ADMIN_PASSWORD,
    [string]$NormalUser = 'tau_user',
    [string]$NormalPass = $env:SMOKE_USER_PASSWORD
)

$ErrorActionPreference = 'Continue'
$script:passed = 0
$script:failed = 0
function Ok($name, $cond, $detail) {
    if ($cond) { $script:passed++; Write-Host "PASS  $name" -ForegroundColor Green }
    else { $script:failed++; Write-Host "FAIL  $name => $detail" -ForegroundColor Red }
}
function J($t) { try { return ([string]$t) | ConvertFrom-Json } catch { return $null } }
function Tmp($json) {
    $p = [IO.Path]::GetTempFileName()
    [IO.File]::WriteAllText($p, [string]$json, (New-Object System.Text.UTF8Encoding($false)))
    return $p
}
function PostJ($url, $json, $token) {
    $p = Tmp $json
    $r = curl.exe -s -X POST -H "X-Authorization-Lizi: $token" -H 'Content-Type: application/json' --data-binary "@$p" $url
    Remove-Item $p -Force
    return $r
}
function PutJ($url, $json, $token) {
    $p = Tmp $json
    $r = curl.exe -s -X PUT -H "X-Authorization-Lizi: $token" -H 'Content-Type: application/json' --data-binary "@$p" $url
    Remove-Item $p -Force
    return $r
}
function GetA($url, $token) { return curl.exe -s -H "X-Authorization-Lizi: $token" $url }
function PostE($url, $token) { return curl.exe -s -X POST -H "X-Authorization-Lizi: $token" $url }
function DelA($url, $token) { return curl.exe -s -X DELETE -H "X-Authorization-Lizi: $token" $url }
function Login($u, $p, $device) {
    $r = curl.exe -s -i -X POST "$Base/user/login" -H 'Content-Type: application/x-www-form-urlencoded' -H "X-Device-Id: $device" --data-urlencode "username=$u" --data-urlencode "password=$p"
    $l = ($r -split "`r?`n" | Where-Object { $_ -match '^X-Authorization-Lizi:' } | Select-Object -First 1)
    if (-not $l) { return '' }
    return ($l -split ':', 2)[1].Trim()
}

$runId = [DateTime]::Now.ToString('MMddHHmmss')
Write-Host "Smoke run $runId against $Base"

# ---------- 登录 ----------
$admin = Login $AdminUser $AdminPass 'smoke-admin'
Ok 'login admin' ($admin.Length -gt 20) "tokenLen=$($admin.Length)"
$user = Login $NormalUser $NormalPass 'smoke-user'
Ok 'login normal user' ($user.Length -gt 20) "tokenLen=$($user.Length)"

# ---------- 空间信息 / 未登录 ----------
$me = J (GetA "$Base/miniProgram/cloud/docs/me" $admin)
Ok 'GET cloud/docs/me' ($me.success -eq $true -and $me.data.quotaBytes -gt 0) ($me | ConvertTo-Json -Compress)
$noAuth = J (curl.exe -s "$Base/miniProgram/cloud/docs/me")
Ok 'unauthorized -> 401' ($noAuth.code -eq 401) ($noAuth | ConvertTo-Json -Compress)

# ---------- 云文档 CRUD ----------
$docPath = "tau/smoke/hello-$runId.md"
$created = J (PostJ "$Base/miniProgram/cloud/docs" ('{"path":"' + $docPath + '","title":"Smoke Hello","content":"# hello\n\nfirst version"}') $admin)
Ok 'create doc v1' ($created.success -eq $true -and $created.data.version -eq 1) ($created | ConvertTo-Json -Compress)
$fileId = $created.data.fileId

$list = J (GetA "$Base/miniProgram/cloud/docs?page=1&size=20" $admin)
Ok 'list contains doc' ($list.success -eq $true -and $list.data.total -ge 1) ($list | ConvertTo-Json -Compress)
$detail = J (GetA "$Base/miniProgram/cloud/docs/$fileId" $admin)
Ok 'detail contains content' ($detail.success -eq $true -and $detail.data.content -match 'first version') ($detail | ConvertTo-Json -Compress)
$versions = J (GetA "$Base/miniProgram/cloud/docs/$fileId/versions" $admin)
Ok 'versions has v1' ($versions.success -eq $true -and $versions.data.Count -ge 1) ($versions | ConvertTo-Json -Compress)

$conflict = J (PostJ "$Base/miniProgram/cloud/docs" ('{"path":"' + $docPath + '","content":"stale","baseVersion":99}') $admin)
Ok 'stale baseVersion -> 409' ($conflict.code -eq 409) ($conflict | ConvertTo-Json -Compress)

$updated = J (PostJ "$Base/miniProgram/cloud/docs" ('{"path":"' + $docPath + '","content":"# hello\n\nsecond version","baseVersion":1}') $admin)
Ok 'overwrite -> v2' ($updated.success -eq $true -and $updated.data.version -eq 2) ($updated | ConvertTo-Json -Compress)

# ---------- 博客在线编辑 / 冲突 ----------
$blogSaved = J (PutJ "$Base/blog/pages/cloud/$fileId" '{"content":"# hello\n\nthird version via blog","baseVersion":2,"category":"笔记","tags":"smoke,cloud"}' $admin)
Ok 'blog online edit -> v3' ($blogSaved.success -eq $true -and $blogSaved.data.version -eq 3) ($blogSaved | ConvertTo-Json -Compress)
$bc = J (PutJ "$Base/blog/pages/cloud/$fileId" '{"content":"stale","baseVersion":1}' $admin)
Ok 'blog online edit stale -> 409' ($bc.code -eq 409) ($bc | ConvertTo-Json -Compress)

# ---------- 越权 / 角色 ----------
$otherRead = J (GetA "$Base/miniProgram/cloud/docs/$fileId" $user)
Ok 'other user private doc -> 404' ($otherRead.code -eq 404) ($otherRead | ConvertTo-Json -Compress)
# 先撤销 Tau 角色，确保「未绑定角色」场景可确定复现（角色校验先于 owner 校验，否则会先命中 404）
$null = PostE "$Base/tauAuthor/2/revoke" $admin
$publish403 = J (PostE "$Base/blog/pages/cloud/$fileId/publish" $user)
Ok 'publish without tau role -> 403' ($publish403.code -eq 403) ($publish403 | ConvertTo-Json -Compress)

# ---------- 发布 / 我的文章 / 公网可见性 ----------
$before = J (GetA "$Base/blog/pages/list?current=1&size=100" $admin)
$beforeHit = $before.data.records | Where-Object { $_.cloudDocId -eq $fileId } | Select-Object -First 1
Ok 'public list excludes unpublished doc' ($null -eq $beforeHit) "hit=$($beforeHit | ConvertTo-Json -Compress)"

$publish = J (PostE "$Base/blog/pages/cloud/$fileId/publish" $admin)
Ok 'admin publish ok' ($publish.success -eq $true -and $publish.data.publishedArticleId -gt 0) ($publish | ConvertTo-Json -Compress)
$articleId = $publish.data.publishedArticleId

$after = J (GetA "$Base/blog/pages/list?current=1&size=100" $admin)
$afterHit = $after.data.records | Where-Object { $_.id -eq $articleId } | Select-Object -First 1
Ok 'public list contains published article' ($null -ne $afterHit) "hit=$($afterHit | ConvertTo-Json -Compress)"
$publicDetail = J (curl.exe -s "$Base/blog/pages/article/$articleId")
Ok 'public article detail anonymous + source=TAU' ($publicDetail.success -eq $true -and $publicDetail.data.data.source -eq 'TAU') ($publicDetail | ConvertTo-Json -Compress | Select-Object -First 1)

$myDocs = J (GetA "$Base/blog/pages/my?page=1&size=20" $admin)
Ok 'GET blog/pages/my' ($myDocs.success -eq $true -and $myDocs.data.records.Count -ge 1) ($myDocs | ConvertTo-Json -Compress)
$myArticles = J (GetA "$Base/miniProgram/article/mine?page=1&size=20" $admin)
Ok 'GET miniProgram/article/mine' ($myArticles.success -eq $true -and $myArticles.data.Count -ge 1) ($myArticles | ConvertTo-Json -Compress)

$withdraw = J (PostE "$Base/blog/pages/cloud/$fileId/withdraw" $admin)
Ok 'withdraw ok' ($withdraw.success -eq $true) ($withdraw | ConvertTo-Json -Compress)
$afterWithdraw = J (GetA "$Base/blog/pages/list?current=1&size=100" $admin)
$withdrawHit = $afterWithdraw.data.records | Where-Object { $_.id -eq $articleId } | Select-Object -First 1
Ok 'public list excludes withdrawn article' ($null -eq $withdrawHit) "hit=$($withdrawHit | ConvertTo-Json -Compress)"

# ---------- 版本恢复 / 软删除 ----------
$versions2 = J (GetA "$Base/miniProgram/cloud/docs/$fileId/versions" $admin)
$v1 = $versions2.data | Where-Object { $_.version -eq 1 } | Select-Object -First 1
$restore = J (PostE "$Base/miniProgram/cloud/docs/$fileId/versions/$($v1.versionId)/restore" $admin)
Ok 'restore -> v4' ($restore.success -eq $true -and $restore.data.version -eq 4) ($restore | ConvertTo-Json -Compress)
$deleted = J (DelA "$Base/miniProgram/cloud/docs/$fileId" $admin)
Ok 'soft delete ok' ($deleted.success -eq $true) ($deleted | ConvertTo-Json -Compress)
$afterDelete = J (GetA "$Base/miniProgram/cloud/docs/$fileId" $admin)
Ok 'detail after delete -> 404' ($afterDelete.code -eq 404) ($afterDelete | ConvertTo-Json -Compress)

# ---------- Tau 角色授权 ----------
$grant = J (PostE "$Base/tauAuthor/2/grant" $admin)
Ok 'admin grants tau author' ($grant.success -eq $true) ($grant | ConvertTo-Json -Compress)
$authorList = J (GetA "$Base/tauAuthor/list" $admin)
Ok 'tau author list contains user 2' ($authorList.success -eq $true -and ($authorList.data | Where-Object { $_.userId -eq 2 })) ($authorList | ConvertTo-Json -Compress)
$revoke = J (PostE "$Base/tauAuthor/2/revoke" $admin)
Ok 'revoke tau author' ($revoke.success -eq $true) ($revoke | ConvertTo-Json -Compress)
$regrant = J (PostE "$Base/tauAuthor/2/grant" $admin)
Ok 're-grant for publish test' ($regrant.success -eq $true) ($regrant | ConvertTo-Json -Compress)

# ---------- 普通用户（Tau 作者）发布自己的文档 ----------
$userCreated = J (PostJ "$Base/miniProgram/cloud/docs" ('{"path":"tau/smoke/user-doc-' + $runId + '.md","title":"User Doc","content":"# user doc"}') $user)
Ok 'normal user creates doc' ($userCreated.success -eq $true) ($userCreated | ConvertTo-Json -Compress)
$userDocId = $userCreated.data.fileId
$userPublish = J (PostE "$Base/blog/pages/cloud/$userDocId/publish" $user)
Ok 'tau author publishes own doc' ($userPublish.success -eq $true) ($userPublish | ConvertTo-Json -Compress)
$userArticle = $userPublish.data.publishedArticleId
$userMine = J (GetA "$Base/miniProgram/article/mine?page=1&size=20" $user)
Ok 'mine only returns own article' ($userMine.success -eq $true -and ($userMine.data | Where-Object { $_.id -eq $userArticle }) -and -not ($userMine.data | Where-Object { $_.id -eq $articleId })) ($userMine | ConvertTo-Json -Compress)

$forbiddenGrant = J (PostE "$Base/tauAuthor/1/grant" $user)
Ok 'non-admin grant -> 403' ($forbiddenGrant.code -eq 403) ($forbiddenGrant | ConvertTo-Json -Compress)

# ---------- 跨设备一致性 ----------
$crossPath = "tau/smoke/cross-$runId.md"
$deviceA = J (PostJ "$Base/miniProgram/cloud/docs" ('{"path":"' + $crossPath + '","title":"Cross","content":"# cross device\n\nsame content"}') $user)
Ok 'device A creates doc' ($deviceA.success -eq $true) ($deviceA | ConvertTo-Json -Compress)
$deviceB = J (curl.exe -s -H "X-Authorization-Lizi: $user" -H 'X-Device-Id: device-B' "$Base/miniProgram/cloud/docs/$($deviceA.data.fileId)")
Ok 'device B reads identical content' ($deviceB.success -eq $true -and $deviceB.data.contentHash -eq $deviceA.data.contentHash) ($deviceB | ConvertTo-Json -Compress)

Write-Host ""
Write-Host "RESULT passed=$($script:passed) failed=$($script:failed) runId=$runId docId=$fileId articleId=$articleId"
if ($script:failed -gt 0) { exit 1 }
