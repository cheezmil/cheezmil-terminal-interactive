### 任务：删除除main分支以外的所有Git分支

- [x] 1. 查看当前所有分支
    - **关键解决方法**: 使用git branch --list命令成功查看了所有分支，确认有main、temp-branch、temp-branch-backup和temp-branch-new四个分支
- [x] 2. 删除temp-branch分支
    - **问题**: 失败！分支'temp-branch'未完全合并，无法使用普通删除命令
- [x] 2-1. 使用强制删除命令删除temp-branch分支
    - **关键解决方法**: 使用git branch -D temp-branch命令成功强制删除了未合并的分支
- [x] 3. 一次性删除所有剩余的非main分支
    - **关键解决方法**: 使用git branch -D temp-branch-backup temp-branch-new命令一次性成功删除了两个分支
- [x] 4. 验证分支删除结果
    - **关键解决方法**: 使用git branch --list验证，确认只剩下main分支，所有非main分支已成功删除