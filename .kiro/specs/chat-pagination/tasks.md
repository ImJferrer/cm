# Implementation Plan: Chat Pagination (Virtual Window + Lazy Loading)

## Overview

Implement a `Pagination_Manager` module inside `chat.js` that limits DOM rendering to a sliding Virtual_Window of messages, supports upward lazy loading via scroll detection, preserves Sticky_Bottom behavior for real-time messages, and adds the required HTML/CSS elements. All changes are confined to `js/chat.js`, `chat.html`, and `style-chat.css`.

## Tasks

- [x] 1. Add HTML and CSS elements for new UI indicators
  - [x] 1.1 Add `#new-message-indicator` element to `chat.html`
    - Insert `<div id="new-message-indicator" class="new-message-indicator hidden" role="button" tabindex="0" aria-label="Saltar al último mensaje">↓ Nuevo mensaje</div>` inside `.chat-scroll-area`, after `#typing-indicator`
    - _Requirements: 3.4, 3.5_

  - [x] 1.2 Add CSS for `.load-more-indicator` and `.new-message-indicator` to `style-chat.css`
    - Add `.load-more-indicator`, `.load-more-indicator.hidden`, `.load-more-indicator.loading`, `.load-more-spinner`, `@keyframes spin`, `.new-message-indicator`, and `.new-message-indicator.hidden` rules as specified in the design document
    - _Requirements: 7.1, 7.2, 3.4_

- [x] 2. Implement Pagination_Manager state and DOM builder helpers in `chat.js`
  - [x] 2.1 Declare Pagination_Manager state variables and constants
    - Add `const INITIAL_BATCH = 60`, `const PAGE_SIZE = 40`, `const LOAD_MORE_TRIGGER = 150` inside the `DOMContentLoaded` closure (near the existing constant declarations)
    - Add `let windowStart = 0`, `let windowEnd = 0`, `let isLoading = false`
    - _Requirements: 1.1, 1.2, 2.1_

  - [x] 2.2 Implement `buildMessageNode(msg)` helper
    - Extract the per-message DOM construction logic from the existing `renderMessages()` loop into a standalone `buildMessageNode(msg)` function that returns a `.chat-message` element
    - The output must be identical to what the current `renderMessages()` produces per message (avatar, bubble, meta line, edit button if applicable)
    - _Requirements: 6.1, 6.2_

  - [x] 2.3 Implement `buildDividerNode(text)` helper
    - Create `buildDividerNode(text)` that returns a `<div class="system-divider">` element with `textContent = text`
    - _Requirements: 4.1, 4.2_

  - [ ]* 2.4 Write unit tests for `buildMessageNode` and `buildDividerNode`
    - Test that `buildMessageNode` returns correct CSS classes and content for `role: 'user'`, `role: 'assistant'`, and `role: 'narrator'` messages
    - Test that `buildDividerNode` returns a `.system-divider` element with correct text
    - _Requirements: 6.1, 4.1_

- [x] 3. Implement `getDividersForRange`, `updateLoadIndicator`, and indicator wiring
  - [x] 3.1 Implement `getDividersForRange(start, end)`
    - Returns a filtered copy of `activeDividers` where `afterIndex` is within `[start, end]`
    - Must not mutate `activeDividers`
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 3.2 Write property test for `getDividersForRange` — Property 5
    - **Property 5: No-duplicate dividers with correct range inclusion**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - Use `fc.array(dividerArb)` + `fc.integer` range arbitraries (fast-check)
    - Assert: result contains exactly the dividers with `afterIndex ∈ [start, end]`, no duplicates

  - [x] 3.3 Implement `updateLoadIndicator()`
    - Create `#load-more-indicator` element via JS if it does not exist and prepend it to `chatBox`
    - If `windowStart > 0` and `!isLoading`: remove `.hidden`, remove `.loading`, show text
    - If `windowStart > 0` and `isLoading`: remove `.hidden`, add `.loading`, show spinner
    - If `windowStart === 0`: add `.hidden`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 3.4 Write property test for `updateLoadIndicator` — Property 7
    - **Property 7: Load indicator reflects Virtual_Window position**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Use `fc.integer({min:0})` for `windowStart` and `fc.boolean()` for `isLoading`
    - Assert the three cases (hidden, spinner, text) match `windowStart`/`isLoading` state

  - [x] 3.5 Wire `#new-message-indicator` click and keyboard handlers
    - Obtain `const newMessageIndicatorEl = document.getElementById('new-message-indicator')` at the top of the closure
    - Implement `showNewMessageIndicator()` — removes `.hidden` from the element
    - Implement `hideNewMessageIndicator()` — adds `.hidden`
    - Add `click` and `keydown` (Enter/Space) listeners: call `scrollChatToBottom({ smooth: true, force: true })` and `hideNewMessageIndicator()`
    - _Requirements: 3.4, 3.5_

- [x] 4. Implement `buildBatchFragment`, `renderWindow`, and `initVirtualWindow`
  - [x] 4.1 Implement `buildBatchFragment(startIdx, endIdx)`
    - Builds a `DocumentFragment` for `messages[startIdx … endIdx)` with correctly interleaved divider nodes from `getDividersForRange(startIdx, endIdx)`
    - Inserts a divider node immediately after the message at position `i` when a divider has `afterIndex === i + 1` (within the range)
    - _Requirements: 2.1, 4.1, 4.2_

  - [x] 4.2 Implement `renderWindow()`
    - Clears `chatBox.innerHTML`
    - Calls `buildBatchFragment(windowStart, windowEnd)` and appends the fragment to `chatBox`
    - Prepends the `#load-more-indicator` element as the first child
    - Does NOT call the old `renderMessages()` function
    - _Requirements: 1.1, 1.2, 6.2_

  - [x] 4.3 Implement `initVirtualWindow()`
    - Sets `windowStart = Math.max(0, messages.length - INITIAL_BATCH)`
    - Sets `windowEnd = messages.length`
    - Calls `renderWindow()`
    - Calls `updateLoadIndicator()`
    - Calls `scrollChatToBottom({ smooth: false, force: true })`
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 4.4 Write property test for `initVirtualWindow` — Property 1
    - **Property 1: Virtual_Window is a suffix slice of Full_History bounded by Initial_Batch**
    - **Validates: Requirements 1.1, 1.2**
    - Use `fc.array(msgArb, { minLength: 0, maxLength: 200 })` as the arbitrary Full_History
    - Assert: `windowEnd - windowStart === Math.min(messages.length, INITIAL_BATCH)` and the rendered messages are the last `min(N, INITIAL_BATCH)` elements

- [x] 5. Modify `hydrateHistory()` to use `initVirtualWindow`
  - [x] 5.1 Replace `renderMessages()` call inside `hydrateHistory()` with `initVirtualWindow()`
    - Remove the `renderMessages()` call that currently follows `loadHistory()` in `hydrateHistory()`
    - Add `initVirtualWindow()` in its place
    - _Requirements: 1.1, 1.2, 1.4_

- [x] 6. Implement `loadPreviousPage` with Anchor_Scroll
  - [x] 6.1 Implement `loadPreviousPage()`
    - Guard: if `isLoading || windowStart === 0` return immediately
    - Set `isLoading = true`, call `updateLoadIndicator()`
    - Wrap insertion in `try/finally` to always reset `isLoading = false` and call `updateLoadIndicator()` on exit
    - Record anchor: `anchorEl = chatBox.children[1]` (first message node after indicator), capture `anchorOffsetBefore = anchorEl.getBoundingClientRect().top`
    - Compute `newStart = Math.max(0, windowStart - PAGE_SIZE)`
    - Build fragment via `buildBatchFragment(newStart, windowStart)`
    - Insert fragment after the load indicator: `loadIndicator.insertAdjacentElement('afterend', fragment)` or equivalent
    - Restore position: `scrollArea.scrollTop += anchorEl.getBoundingClientRect().top - anchorOffsetBefore`
    - Fallback: if `getBoundingClientRect()` returns 0 use `PAGE_SIZE * 60` as estimated height
    - Set `windowStart = newStart`, call `updateLoadIndicator()`
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 7.2_

  - [ ]* 6.2 Write property test for Anchor_Scroll — Property 3
    - **Property 3: Anchor_Scroll invariant — visual position preserved after top-insertion**
    - **Validates: Requirements 2.2**
    - Use `fc.array(msgArb, { minLength: 1 })` and `fc.integer` for `windowStart`
    - Assert: `scrollTop` delta equals the height of the prepended content

  - [ ]* 6.3 Write property test for `isLoading` mutex — Property 8
    - **Property 8: loadPreviousPage idempotence under concurrent calls**
    - **Validates: Requirements 2.5**
    - Simulate N concurrent calls to `loadPreviousPage()` (promise resolution order)
    - Assert: exactly one additional batch is inserted into the DOM

- [x] 7. Implement `appendMessage` and modify `addMessage`
  - [x] 7.1 Implement `appendMessage(msg)`
    - Build the message node via `buildMessageNode(msg)` and call `chatBox.appendChild(node)`
    - Insert any dividers at `afterIndex === windowEnd` from `activeDividers`
    - Increment `windowEnd`
    - Call `refreshStickToBottomState()` (or use the existing `isChatNearBottom()` check)
    - If `shouldStickToBottom`: call `scrollChatToBottom({ smooth: true, force: true })` and call `hideNewMessageIndicator()`
    - Else if `msg.author !== player.name`: call `showNewMessageIndicator()`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 7.2 Modify `addMessage(text, author, options)` to use `appendMessage`
    - Replace the `renderMessages()` + `scrollChatToBottom()` block at the end of `addMessage()` with a call to `appendMessage(messages[messages.length - 1])`
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 7.3 Write property test for Sticky_Bottom and new-message indicator — Property 4
    - **Property 4: Sticky_Bottom correctness and new-message indicator**
    - **Validates: Requirements 3.2, 3.3, 3.4**
    - Use `fc.boolean()` for `shouldStickToBottom` and `msgArb` for incoming message
    - Assert the three cases: auto-scroll, indicator shown (other user), indicator NOT shown (own message)

- [x] 8. Add scroll event listener for lazy loading trigger
  - [x] 8.1 Attach scroll listener to `.chat-scroll-area` for `loadPreviousPage`
    - In the scroll event handler (which already exists for `shouldStickToBottom` tracking), add: if `scrollArea.scrollTop <= LOAD_MORE_TRIGGER` call `loadPreviousPage()`
    - _Requirements: 2.1, 2.5_

- [x] 9. Modify `renderSystemDivider` and `renderMessages` for windowing
  - [x] 9.1 Modify `renderSystemDivider(text)` to append only when in Virtual_Window
    - After pushing to `activeDividers`, check if `messages.length >= windowStart && messages.length <= windowEnd`; if so build and append the divider node directly to `chatBox`; otherwise do nothing (divider will appear when its range is loaded)
    - _Requirements: 4.1, 4.2_

  - [x] 9.2 Update `renderMessages()` / `renderWindow()` call sites for `player_list` and `avatar_update` WS events
    - Replace any `renderMessages()` calls in the `player_list` and `avatar_update` WS event handlers with `renderWindow()` so that re-renders respect `windowStart`/`windowEnd`
    - _Requirements: 6.2_

- [ ] 10. Verify Full_History independence for JSON Download
  - [x] 10.1 Confirm `downloadChatBtnEl` reads directly from `localStorage` key `dwjc2_chat_history`
    - Read the existing download handler; verify it uses `localStorage.getItem(HISTORY_KEY)` and does not reference `windowStart`, `windowEnd`, or any Virtual_Window state
    - If any Virtual_Window reference is present, remove it
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 10.2 Write property test for JSON_Download independence — Property 6
    - **Property 6: JSON_Download independence from Virtual_Window**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - Use `fc.array(msgArb)` with a partial Virtual_Window (windowStart > 0)
    - Assert: download output equals `JSON.stringify(JSON.parse(localStorage.getItem('dwjc2_chat_history')))` regardless of Virtual_Window state

  - [ ]* 10.3 Write property test for Full_History monotone invariant — Property 2
    - **Property 2: Full_History completeness — monotone and equal to persisted state**
    - **Validates: Requirements 1.3, 5.1, 5.2, 5.3**
    - Use `fc.array(msgArb)` plus a random sequence of `appendMessage` and `loadPreviousPage` operations
    - Assert: `messages.length` is monotonically non-decreasing and equals `JSON.parse(localStorage.getItem(HISTORY_KEY)).length`

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all unit and property tests pass.
  - Verify in the browser: open chat with a localStorage fixture of 200+ messages, confirm only 60 are rendered; scroll to top and confirm 40 more load without a visible jump; send a message and confirm auto-scroll; scroll up and receive a message and confirm the "↓ Nuevo mensaje" indicator appears.
  - Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `buildMessageNode` must produce output identical to the current per-message loop in `renderMessages()` to avoid visual regressions
- `renderWindow()` replaces `renderMessages()` for all window-aware renders; `renderMessages()` is kept only for `resetChatHistory()`
- Property tests use **fast-check** (`npm install --save-dev fast-check` in the project or test environment)
- All Pagination_Manager variables live inside the existing `DOMContentLoaded` closure — no new global scope is introduced
- The `#load-more-indicator` element is created by `initVirtualWindow()` in JS, not added to `chat.html`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.1", "3.3", "3.5"] },
    { "id": 2, "tasks": ["2.4", "3.2", "3.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4", "5.1"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 7, "tasks": ["7.2", "8.1"] },
    { "id": 8, "tasks": ["7.3", "9.1", "9.2"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3"] }
  ]
}
```
