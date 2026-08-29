// src/lib/translateDomGuard.js
//
// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE TRANSLATE vs REACT — the "object can not be found here" crash
// ─────────────────────────────────────────────────────────────────────────────
//
// THE SYMPTOM
// A page works for weeks, then a client on a Mac opens /admin, clicks a folder,
// and the entire site vanishes. Safari's console says:
//
//   NotFoundError: The object can not be found here.
//   removeChild@[native code]
//
// with a stack that is all React internals. Nothing in our code appears in it,
// it cannot be reproduced on the developer's machine, and it looks like a
// browser bug. It is not.
//
// THE CAUSE
// This site layers Google Translate over i18next for every language we do not
// ship a locale file for (see src/lib/lang.js). Translate works by reaching
// into the DOM and REPLACING text nodes with its own <font> wrappers.
//
// React does not know that happened. It still holds a reference to the original
// text node and, on the next update, calls
//
//   parent.removeChild(originalTextNode)
//
// The original node is no longer a child of that parent — Translate swapped it
// out — so the browser throws. A throw inside React's commit phase tears down
// the whole tree, which is why the page goes blank rather than glitching.
//
// It bites hardest where text is swapped conditionally, which is exactly what
// the admin folder view does: "Loading media…" is replaced by the grid the
// moment the files arrive.
//
// THE FIX
// Make the two DOM operations React relies on tolerant of a node that has
// already been moved: if the child is not where React thinks it is, there is
// nothing to remove, so return instead of throwing. React reconciles from its
// own virtual tree on the next render and recovers on its own.
//
// This is the long-standing workaround for facebook/react#11538. It is applied
// once, before the first render, and touches nothing else: a removeChild with a
// correct parent behaves exactly as before.
//
// WHY NOT JUST TURN OFF TRANSLATE — because translation is a feature here, not
// an accident. Hebrew, Russian and Arabic have hand-written locale files, but
// every other language a visitor might arrive in depends on Google Translate,
// and this site is sold to riders across Europe.

export function installTranslateDomGuard() {
  if (typeof Node !== "function" || !Node.prototype) return;
  // Guard against running twice (hot reload, double import).
  if (Node.prototype.__ldTranslateGuard) return;
  Node.prototype.__ldTranslateGuard = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild(child) {
    if (child && child.parentNode !== this) {
      // Already detached or re-parented by Translate. Hand the node back so
      // callers that use the return value keep working, and let React's next
      // render put things right.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[translate-guard] skipped removeChild of a re-parented node", child);
      }
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      // The reference node moved, so "before" is meaningless here. Appending
      // keeps the node in the tree; React corrects the order on the next pass.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[translate-guard] insertBefore fell back to append", referenceNode);
      }
      return this.appendChild(newNode);
    }
    return originalInsertBefore.apply(this, arguments);
  };
}
