- [x] 1. 修改SettingsView.vue，将配置页面的宽度设置为占满整个页面宽度
- [x] 2. 修复按钮图标和文字之间缺少间距的问题，确保所有类似组件都有适当的间距
- [x] 3. 测试前端修改，确保样式正确显示
- [x] 3-1. 修正按钮图标和文字间距问题（用户反馈未解决）
  **关键解决方法**：在SettingsView.vue中添加了更精确的CSS样式来修复按钮图标和文字之间的间距问题，特别是针对luxury-back-button和其他文本按钮。添加了.p-button.p-button-text类的通用样式，确保所有文本按钮的图标和文字之间都有0.75rem的间距。为luxury-back-button明确添加了.p-button-label的margin-left样式。