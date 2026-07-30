
/**
 * ChatTiptapInput — Lovable-parity chat input built on Tiptap / ProseMirror.
 *
 * Mirrors Lovable's `ChatInputTiptap` contenteditable ("Ask…") while remaining
 * a drop-in replacement for the previous <Textarea>: it forwards a
 * textarea-compatible imperative handle (`focus`, `selectionStart`,
 * `setSelectionRange`) and emits synthetic change/keydown events, so the
 * existing @-mention / cross-project / slash-command logic in chat-panel keeps
 * working against ProseMirror without changes.
 *
 * Mentions are atomic inline chips (`@path`, `@connector:…`) so backspace
 * deletes the whole token. Enter submits (unless a mention/template popover
 * consumes it); Shift+Enter inserts a newline.
 */

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/** The subset of HTMLTextAreaElement that chat-panel actually calls. */
export interface ChatInputHandle {
  focus: () => void;
  /** Textarea-compat: current plain-text content. */
  value: string;
  selectionStart: number;
  setSelectionRange: (start: number, end: number) => void;
}

interface ChatTiptapInputProps {
  value: string;
  /** Receives a synthetic event shaped like a textarea change event. */
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Receives a synthetic event shaped like a textarea keydown event. */
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Return true to consume the paste before ProseMirror inserts it. */
  onPasteText?: (
    text: string,
    event: ClipboardEvent,
    selection: { from: number; to: number },
  ) => boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Match @file / @connector:id / @chat:slug / @project:… style tokens. */
const MENTION_TOKEN_RE = /@[\w./:@+-]+/g;

const MentionChip = Node.create({
  name: "mentionChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      label: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-mention-chip]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const label = String(node.attrs.label ?? "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention-chip": "",
        class:
          // Lovable-parity: drifting gradient mention pill (see globals.css)
          "mention-pill-lifemark inline-flex items-center rounded-full px-1.5 py-0.5 mx-0.5 text-[12px] font-medium text-[var(--fg-primary)] align-baseline",
        contenteditable: "false",
      }),
      `@${label}`,
    ];
  },
  renderText({ node }) {
    return `@${String(node.attrs.label ?? "")}`;
  },
});

type InlineNode =
  | { type: "text"; text: string }
  | { type: "mentionChip"; attrs: { label: string } };

function textToDocJson(text: string): { type: "doc"; content: Array<{ type: "paragraph"; content?: InlineNode[] }> } {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => {
      const content: InlineNode[] = [];
      let last = 0;
      MENTION_TOKEN_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = MENTION_TOKEN_RE.exec(line)) !== null) {
        if (m.index > last) {
          content.push({ type: "text", text: line.slice(last, m.index) });
        }
        content.push({ type: "mentionChip", attrs: { label: m[0].slice(1) } });
        last = m.index + m[0].length;
      }
      if (last < line.length) content.push({ type: "text", text: line.slice(last) });
      return content.length > 0
        ? { type: "paragraph", content }
        : { type: "paragraph" };
    }),
  };
}

/** ProseMirror doc position → plain-text offset (blocks joined by "\n"). */
function posToTextOffset(doc: ProseMirrorNode, pos: number): number {
  return doc.textBetween(0, pos, "\n", "\n").length;
}

/** Plain-text offset → ProseMirror doc position (inverse of the above). */
function textOffsetToPos(doc: ProseMirrorNode, offset: number): number {
  let best = 0;
  const max = doc.content.size;
  for (let p = 0; p <= max; p++) {
    if (posToTextOffset(doc, p) <= offset) best = p;
    else break;
  }
  return best;
}

export const ChatTiptapInput = React.forwardRef<ChatInputHandle, ChatTiptapInputProps>(
  function ChatTiptapInput(
    { value, onChange, onKeyDown, onPasteText, placeholder, disabled, className },
    ref,
  ) {
    // Keep the latest onKeyDown/onChange in refs so the editor's static
    // handlers always see current closures without re-instantiating the editor.
    const onKeyDownRef = React.useRef(onKeyDown);
    const onChangeRef = React.useRef(onChange);
    const onPasteTextRef = React.useRef(onPasteText);
    onKeyDownRef.current = onKeyDown;
    onChangeRef.current = onChange;
    onPasteTextRef.current = onPasteText;
    // Placeholder is read live via a ref so the (dynamic) smartPlaceholder from
    // chat-panel updates without re-instantiating the editor.
    const placeholderRef = React.useRef(placeholder);
    placeholderRef.current = placeholder;

    const editor = useEditor({
      immediatelyRender: false,
      editable: !disabled,
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          bold: false,
          italic: false,
          strike: false,
          code: false,
        }),
        MentionChip,
        // Empty string disables TipTip placeholder — Lovable dump uses a sibling overlay span.
        Placeholder.configure({ placeholder: () => placeholderRef.current ?? "" }),
      ],
      content: textToDocJson(value),
      editorProps: {
        attributes: {
          class:
            "tiptap ProseMirror outline-none whitespace-pre-wrap break-words min-h-[40px] max-h-[max(35svh,5rem)] overflow-y-auto px-2 pt-2 pb-1 text-[16px] leading-snug md:text-base text-[var(--fg-primary)]",
          role: "textbox",
          "aria-label": "Chat input",
          "aria-multiline": "true",
        },
        handleKeyDown: (_view: EditorView, event: KeyboardEvent) => {
          let prevented = false;
          onKeyDownRef.current({
            key: event.key,
            shiftKey: event.shiftKey,
            preventDefault: () => {
              prevented = true;
              event.preventDefault();
            },
          } as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
          // If the parent consumed the key (Enter-to-send, mention nav, …),
          // stop ProseMirror from also acting on it.
          return prevented;
        },
        handlePaste: (_view: EditorView, event: ClipboardEvent) => {
          const text = event.clipboardData?.getData("text/plain") ?? "";
          if (!text) return false;
          const selection = {
            from: posToTextOffset(_view.state.doc, _view.state.selection.from),
            to: posToTextOffset(_view.state.doc, _view.state.selection.to),
          };
          if (onPasteTextRef.current?.(text, event, selection)) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }: { editor: Editor }) => {
        const text = ed.getText({ blockSeparator: "\n" });
        const selStart = posToTextOffset(ed.state.doc, ed.state.selection.head);
        onChangeRef.current({
          target: { value: text, selectionStart: selStart },
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>);
      },
    });

    // Sync external value → editor when they diverge (programmatic setInput:
    // starter prompts, mention inserts, clear-after-send). Re-parse mentions
    // into atomic chips so @tokens stay whole on backspace.
    React.useEffect(() => {
      if (!editor) return;
      const current = editor.getText({ blockSeparator: "\n" });
      if (value !== current) {
        editor.commands.setContent(textToDocJson(value), false);
      }
    }, [value, editor]);

    // Reflect disabled state.
    React.useEffect(() => {
      editor?.setEditable(!disabled);
    }, [disabled, editor]);

    // Refresh the placeholder decoration when the dynamic placeholder changes
    // while empty — a prop change alone doesn't trigger a ProseMirror transaction.
    React.useEffect(() => {
      if (editor && editor.isEmpty) {
        editor.view.dispatch(editor.state.tr);
      }
    }, [placeholder, editor]);

    // Textarea-compatible imperative handle.
    React.useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus(),
        /** Textarea-compat: callers do `el.value.length` to move the caret
         *  to the end — without this getter that access throws. */
        get value() {
          return editor?.getText() ?? "";
        },
        get selectionStart() {
          if (!editor) return 0;
          return posToTextOffset(editor.state.doc, editor.state.selection.head);
        },
        setSelectionRange: (start: number, end: number) => {
          if (!editor) return;
          const from = textOffsetToPos(editor.state.doc, start);
          const to = textOffsetToPos(editor.state.doc, end);
          editor.commands.setTextSelection({ from, to });
          editor.commands.focus();
        },
      }),
      [editor],
    );

    return (
      <div
        className={className}
        data-chat-tiptap=""
        aria-disabled={disabled || undefined}
      >
        <EditorContent editor={editor} />
      </div>
    );
  },
);
