# Upstream tree-sitter-swift 0.7.3 issue drafts

Target: `alex-pinkus/tree-sitter-swift`

Status: posted 2026-08-24 with the repository owner's explicit approval.

- https://github.com/alex-pinkus/tree-sitter-swift/issues/610
- https://github.com/alex-pinkus/tree-sitter-swift/issues/611

Both reproductions were verified with the 0.7.3 release WASM grammar through
`web-tree-sitter` 0.25.10. These are parser-only checks; no Swift or repository
code was executed.

## Conditional cast followed by nil coalescing produces an ERROR node

Suggested title:

> Parser error for conditional cast followed by nil coalescing (`as? T ?? value`)

Suggested body:

````markdown
### Version

`tree-sitter-swift` 0.7.3 release WASM, loaded with `web-tree-sitter` 0.25.10.

### Minimal reproduction

```swift
let x = d.get() as? Bool ?? true
```

### Actual behavior

The syntax tree has an error and the `ERROR` node spans `true` (columns
28–32).

### Expected behavior

The expression parses without an `ERROR` node. Each operator parses when used
without the other:

```swift
let x = d.get() as? Bool
let x = d.get() ?? true
```
````

## `try? await` in an optional binding produces an ERROR node

Suggested title:

> Parser error for `try? await` inside an optional binding

Suggested body:

````markdown
### Version

`tree-sitter-swift` 0.7.3 release WASM, loaded with `web-tree-sitter` 0.25.10.

### Minimal reproduction

```swift
func f() async {
  if let r = try? await g() {
    print(r)
  }
}
```

### Actual behavior

The syntax tree has an error and the `ERROR` node spans the complete optional
binding statement (`if let r = try? await g() { print(r) }`). Plain
`try await` fails in the same position too.

### Expected behavior

The optional binding parses without an `ERROR` node. The `try?` and `await`
forms each parse in isolation:

```swift
func f() async { if let r = try? g() { print(r) } }
func f() async { if let r = await g() { print(r) } }
```

As another control, an awaited condition in a `while` statement parses:

```swift
func f() async { while c, await g() { print(c) } }
```
````
