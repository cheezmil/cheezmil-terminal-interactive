```bash
cls
# 只保留 stash 最新的 50 个，后面的删掉
$stashCount = (git stash list | Measure-Object -Line).Lines
if ($stashCount -gt 50) {
    $deleteCount = $stashCount - 50
    for ($i = $deleteCount; $i -ge 1; $i--) {
        $index = $i - 1
        git stash drop "stash@{$index}"
    }
}
$prevStashCount = (git stash list | Measure-Object -Line).Lines
git stash push -u -m "拉取远程仓库前的有用暂存" 2>$null
$newStashCount = (git stash list | Measure-Object -Line).Lines
git pull origin main --rebase
if ($newStashCount -gt $prevStashCount) {
    git stash apply 'stash@{0}'
}
git checkout main
git add .
git commit -m "12100提交"
git push -u origin main
```