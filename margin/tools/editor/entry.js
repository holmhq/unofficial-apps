// Everything Margin's editor needs from Tiptap (MIT), bundled into one browser module:
// web/vendor/editor/tiptap.js. Rebuild with: npm install && npm run build
export { Editor, Extension, Node, Mark, mergeAttributes, InputRule, nodeInputRule } from '@tiptap/core';
export { Plugin, PluginKey, TextSelection, NodeSelection } from '@tiptap/pm/state';
export { default as StarterKit } from '@tiptap/starter-kit';
export { Placeholder, CharacterCount, Selection } from '@tiptap/extensions';
export { TaskList, TaskItem } from '@tiptap/extension-list';
export { Image } from '@tiptap/extension-image';
export { TableKit } from '@tiptap/extension-table';
export { Markdown } from '@tiptap/markdown';
export { default as Suggestion } from '@tiptap/suggestion';
export { BubbleMenu } from '@tiptap/extension-bubble-menu';
