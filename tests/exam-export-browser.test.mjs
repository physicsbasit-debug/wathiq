import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadBlob,
  printHtmlDocument,
} from "../dist/assets/exam-export.js";

test("ينفذ تنزيل Word وطباعة PDF فعليًا عبر رابط خفي وiframe", async () => {
  const actions = [];
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

  const frameDocument = {
    fonts: { ready: Promise.resolve() },
    images: [],
    title: "",
    open() { actions.push("frame-open"); },
    write(html) {
      assert.match(html, /اختبار واثق/);
      actions.push("frame-write");
    },
    close() { actions.push("frame-close"); },
  };
  const frameWindow = {
    document: frameDocument,
    focus() { actions.push("frame-focus"); },
    print() { actions.push("frame-print"); },
  };

  const body = {
    append(node) {
      actions.push(node.kind === "iframe" ? "iframe-append" : "anchor-append");
    },
  };

  try {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value() {
        actions.push("blob-url-create");
        return "blob:wathiq-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value(url) {
        assert.equal(url, "blob:wathiq-test");
        actions.push("blob-url-revoke");
      },
    });

    globalThis.document = {
      body,
      createElement(tagName) {
        if (tagName === "a") {
          return {
            kind: "anchor",
            style: {},
            href: "",
            download: "",
            click() { actions.push("anchor-click"); },
            remove() { actions.push("anchor-remove"); },
          };
        }
        if (tagName === "iframe") {
          return {
            kind: "iframe",
            style: {},
            contentWindow: frameWindow,
            setAttribute() {},
            remove() { actions.push("iframe-remove"); },
          };
        }
        throw new Error(`عنصر غير متوقع في الاختبار: ${tagName}`);
      },
    };
    globalThis.window = {
      navigator: {},
      setTimeout(callback) {
        queueMicrotask(callback);
        return 1;
      },
    };

    downloadBlob("ورقة_الطالب.doc", new Blob(["word"]));
    await Promise.resolve();
    assert.deepEqual(
      actions.slice(0, 5),
      ["blob-url-create", "anchor-append", "anchor-click", "anchor-remove", "blob-url-revoke"],
    );

    const started = printHtmlDocument(
      "اختبار واثق",
      "<!doctype html><html><body>اختبار واثق</body></html>",
    );
    assert.equal(started, true);
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(actions.includes("iframe-append"));
    assert.ok(actions.includes("frame-write"));
    assert.ok(actions.includes("frame-print"));
    assert.ok(actions.includes("iframe-remove"));
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;

    if (createObjectUrlDescriptor) {
      Object.defineProperty(URL, "createObjectURL", createObjectUrlDescriptor);
    } else {
      delete URL.createObjectURL;
    }
    if (revokeObjectUrlDescriptor) {
      Object.defineProperty(URL, "revokeObjectURL", revokeObjectUrlDescriptor);
    } else {
      delete URL.revokeObjectURL;
    }
  }
});
