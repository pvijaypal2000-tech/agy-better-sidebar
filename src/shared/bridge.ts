import type { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import type { SelectionInfo } from "./types";

export type AiActionKind = "explain" | "flowchart" | "walkthrough" | "attach";

export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function buildAiPrompt(
  action: AiActionKind,
  opts: {
    filename: string;
    relPath?: string;
    languageLabel: string;
    fullContent: string;
    selection?: SelectionInfo | null;
  },
): string {
  const displayPath = opts.relPath || opts.filename;
  const hasSelection = Boolean(opts.selection && opts.selection.text.trim().length > 0);
  const rangeLabel = hasSelection
    ? `第 ${opts.selection!.fromLine}–${opts.selection!.toLine} 行`
    : "完整文件";

  // Keep prompt payload clean & well-bounded
  const rawSnippet = hasSelection ? opts.selection!.text : opts.fullContent;
  const MAX_CHARS = 16000;
  const truncated = rawSnippet.length > MAX_CHARS;
  const snippet = truncated
    ? rawSnippet.slice(0, MAX_CHARS) + "\n... (内容较长，已截断，请结合项目原文件查看完整上下文)"
    : rawSnippet;

  const header = `文件：\`${displayPath}\`（${opts.languageLabel}，${rangeLabel}）`;
  const codeBlock = `\n\`\`\`${opts.languageLabel.toLowerCase().split(/\s+/)[0] || ""}\n${snippet}\n\`\`\``;

  if (action === "attach") {
    return `[来自 Better Sidebar 的代码引用]\n${header}${codeBlock}`;
  }

  if (action === "explain") {
    return (
      `请用通俗易懂的大白话，向非专业程序员讲清楚下面这段代码：\n` +
      `1. 它整体是干什么用的（一句话总结）；\n` +
      `2. 核心输入、处理步骤和输出分别是什么；\n` +
      `3. 里面最容易让人看不懂的术语或关键语法逐个解释。\n\n` +
      `${header}${codeBlock}`
    );
  }

  if (action === "flowchart") {
    return (
      `请分析下面代码的核心执行逻辑和数据流向，先用一张清晰的 Mermaid 流程图（flowchart TD）画出来，再用 3~5 条简短中文要点说明每一步在干什么：\n\n` +
      `${header}${codeBlock}`
    );
  }

  // walkthrough
  return (
    `请帮我按顺序逐段导读下面这段代码，把每个模块/函数的职责用中文标出来，并告诉我阅读时应该重点关注哪几行：\n\n` +
    `${header}${codeBlock}`
  );
}

export async function dispatchAiAction(
  app: App | null,
  action: AiActionKind,
  prompt: string,
  sendToNewConversation: boolean,
): Promise<{ status: "sent" | "sent-new" | "attached" | "copied"; message: string }> {
  const caps = app?.getHostCapabilities();

  if (action === "attach") {
    if (app && caps?.updateModelContext) {
      try {
        await app.updateModelContext({
          content: [{ type: "text", text: prompt }],
        });
        return {
          status: "attached",
          message: "已将代码挂载到聊天输入框上下文气泡，直接输入你的问题即可发送",
        };
      } catch {
        // fall through to copy
      }
    }
    await copyToClipboard(prompt);
    return {
      status: "copied",
      message: "当前视图不支持上下文挂载，已为你复制带行号的代码引用",
    };
  }

  if (app && caps?.message) {
    try {
      const payload: Record<string, unknown> = {
        role: "user",
        content: [{ type: "text", text: prompt }],
      };
      if (sendToNewConversation) {
        payload._meta = {
          "com.google.antigravity/message": { target: "new" },
        };
      }
      const res = await app.sendMessage(
        payload as unknown as Parameters<App["sendMessage"]>[0],
      );
      if (!res?.isError) {
        return sendToNewConversation
          ? { status: "sent-new", message: "已发往后台新对话进行代码解读（不打扰当前主任务）" }
          : { status: "sent", message: "已发送到当前 Antigravity 对话，请在左侧查看解读" };
      }
    } catch {
      // fall through to copy
    }
  }

  await copyToClipboard(prompt);
  return {
    status: "copied",
    message: "当前全屏视图无关联对话，已复制解读提示词，可粘贴到任意对话中",
  };
}

export function pathToFileUri(absPath: string): string {
  const norm = absPath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(norm)) {
    return "file:///" + encodeURI(norm);
  }
  return "file://" + encodeURI(norm.startsWith("/") ? norm : "/" + norm);
}

export async function openInNativeAuxPane(app: App | null, absPath: string): Promise<boolean> {
  if (!app || !absPath) return false;
  try {
    const uri = pathToFileUri(absPath);
    const res = await app.request(
      {
        method: "com.google.antigravity/toggle-aux-pane",
        params: { tabType: "fileView", uri },
      } as unknown as Parameters<App["request"]>[0],
      z.object({ isError: z.boolean().optional() }).passthrough(),
    );
    return !res?.isError;
  } catch {
    return false;
  }
}
