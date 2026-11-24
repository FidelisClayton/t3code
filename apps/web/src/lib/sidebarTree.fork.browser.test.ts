import { describe, expect, it, vi } from "vite-plus/test";
import { installSidebarTree } from "./sidebarTree";

function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  let dispose: (() => void) | undefined;
  const row = (id: string, parent?: string) => {
    const element = document.createElement("button");
    element.dataset.sidebarRow = id;
    if (parent) element.dataset.sidebarParent = parent;
    element.textContent = id;
    root.append(element);
    return element;
  };
  return {
    root,
    row,
    install: () => {
      dispose = installSidebarTree(root);
    },
    [Symbol.dispose]() {
      dispose?.();
      root.remove();
    },
  };
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("sidebar thread family disclosure", () => {
  it("uses a thread disclosure for Left and Right without activating its chat", async () => {
    using tree = setup();
    const parent = tree.row("parent");
    const child = tree.row("child", "parent");
    const grandchild = tree.row("grandchild", "child");
    const disclosure = document.createElement("button");
    disclosure.dataset.sidebarDisclosure = "";
    parent.append(disclosure);
    parent.setAttribute("aria-expanded", "true");
    const activate = vi.fn();
    parent.addEventListener("click", activate);
    disclosure.addEventListener("click", (event) => {
      event.stopPropagation();
      const expanded = parent.getAttribute("aria-expanded") === "true";
      parent.setAttribute("aria-expanded", String(!expanded));
      child.hidden = expanded;
      grandchild.hidden = expanded;
    });
    tree.install();
    grandchild.focus();
    disclosure.click();
    await vi.waitFor(() => expect(document.activeElement).toBe(parent));
    press(parent, "ArrowRight");
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    press(parent, "ArrowRight");
    expect(document.activeElement).toBe(child);
    press(child, "ArrowLeft");
    expect(document.activeElement).toBe(parent);
    press(parent, "ArrowLeft");
    expect(parent.getAttribute("aria-expanded")).toBe("false");
    expect(activate).not.toHaveBeenCalled();
    parent.click();
    expect(activate).toHaveBeenCalledOnce();
  });
});
