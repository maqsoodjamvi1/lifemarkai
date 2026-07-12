"use client";

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
 * Plain-text only (formatting marks/nodes disabled) — this is a prompt box, not
 * a rich editor. Enter submits (unless a mention/template popover consumes it);
 * Shift+Enter inserts a newline.
 */

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/** The subset of HTMLTextAreaElement that chat-panel actually calls. */
export interface ChatInputHandle {
  focus: () => void;
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
        Placeholder.configure({ placeholder: () => placeholderRef.current ?? "Ask LifemarkAI…" }),
      ],
      content: value,
      editorProps: {
        attributes: {
          class:
            "outline-none whitespace-pre-wrap break-words min-h-[52px] max-h-40 overflow-y-auto px-4 pt-4 pb-2 text-sm text-[var(--fg-primary)]",
          role: "textbox",
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
    // starter prompts, mention inserts, clear-after-send).
    React.useEffect(() => {
      if (!editor) return;
      const current = editor.getText({ blockSeparator: "\n" });
      if (value !== current) {
        editor.commands.setContent(value, false);
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
