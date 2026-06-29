# React Bug Patterns — Reference

A practical reference covering the recurring failure modes in React apps, from hooks misuse to state architecture, with concrete bad/good examples and the mental model behind each one. Written against the React 19.x API surface.

---

## How to read this document

Each section names a pattern, explains why it fails, shows bad and good code side by side, and ends with a *detection signal* — the thing you look for in a code review or while debugging.

---

## 1. Stale closures

### What it is

A callback or effect captures a variable at creation time. The variable later changes, but the closure still holds the old value. No error is thrown. The UI silently uses stale data.

### Why it happens

React components are functions. Every render creates a new closure over the current props and state. If a `useEffect`, `useCallback`, or `setInterval` callback is created on render N but runs on render N+3, it sees render N's values unless it was rebuilt with the updated deps.

### Bad

```tsx
useEffect(() => {
  const id = setInterval(() => {
    setCount(count + 1) // count is frozen at the value from the render this ran on
  }, 1000)
  return () => clearInterval(id)
}, []) // empty deps — callback is never rebuilt
```

### Good

```tsx
// Option A: functional updater — never reads count at all
useEffect(() => {
  const id = setInterval(() => {
    setCount(c => c + 1)
  }, 1000)
  return () => clearInterval(id)
}, [])

// Option B: useRef to always read latest value
const countRef = useRef(count)
useEffect(() => { countRef.current = count }, [count])

useEffect(() => {
  const id = setInterval(() => {
    doSomethingWith(countRef.current) // always current
  }, 1000)
  return () => clearInterval(id)
}, [])
```

### Detection signal

An empty `[]` dep array on a `useEffect` or `useCallback` that references any state or prop. Ask: does this callback ever need to see an updated value? If yes, either add the dep or use a ref.

---

## 2. Missing or lying deps arrays

### What it is

The deps array is the contract between your effect/memo/callback and React. Lying to it (omitting deps to "prevent re-runs") produces stale closures and unpredictable behavior. Over-including deps causes unnecessary re-runs.

### Bad

```tsx
// Lie by omission — lint suppressed to hide the problem
useEffect(() => {
  fetchData(userId, filters) // filters changes, but effect never re-runs
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId])
```

### Good

```tsx
useEffect(() => {
  fetchData(userId, filters)
}, [userId, filters])
// if filters changing causes too many fetches, that's an upstream
// problem — fix filters' reference stability, not the dep array
```

### The real fix when deps change too often

If `filters` is an object reconstructed on every render, stabilize it upstream:

```tsx
// atom-based (Jotai/Recoil): use selectAtom with shallow equality
// plain state: useMemo or useState with manual comparison
const stableFilters = useMemo(() => filters, [filters.type, filters.status])
```

### Detection signal

`// eslint-disable-next-line react-hooks/exhaustive-deps` is a red flag 90% of the time. The comment exists to suppress a real warning. Read what the linter was complaining about before accepting the suppression.

---

## 3. Object and function reference identity

### What it is

JavaScript's `===` compares by reference for objects and functions. React's bailout mechanisms — `memo`, `useSelector`, Context diffing — all use `===`. Constructing a new object or function in the render path silently defeats every memoization downstream.

### Bad — inline function breaks `memo`

```tsx
function Parent() {
  const [count, setCount] = useState(0)

  return (
    <Child
      onClick={() => doSomething()} // new function every render
    />
  )
}

const Child = memo(({ onClick }) => <button onClick={onClick}>Click</button>)
// memo compares onClick by reference — always different — always re-renders
```

### Good

```tsx
function Parent() {
  const [count, setCount] = useState(0)
  const onClick = useCallback(() => doSomething(), [])

  return <Child onClick={onClick} />
}
```

### Bad — object selector defeats selector equality

```tsx
const data = useSelector(state => ({
  name: state.user.name,
  role: state.user.role,
}))
// {} !== {} on every call — re-renders on any store change
```

### Good

```tsx
const name = useSelector(s => s.user.name)
const role = useSelector(s => s.user.role)
// primitives compared by value — only re-renders when name or role changes
```

### Bad — Context value object rebuilt on every render

```tsx
function Provider({ children }) {
  const [user, setUser] = useState(null)
  return (
    <Ctx.Provider value={{ user, setUser }}>
      {children}
    </Ctx.Provider>
  )
  // value={} is a new object every render — all consumers always re-render
}
```

### Good

```tsx
function Provider({ children }) {
  const [user, setUser] = useState(null)
  const value = useMemo(() => ({ user, setUser }), [user])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
```

### Detection signal

Any `{}` or `() => {}` literal in JSX props or passed to `useEffect`/`useMemo`/`useCallback` without being wrapped in a stable form. Also: `useSelector` that returns a plain object instead of a primitive.

---

## 4. `useEffect` used for the wrong purpose

### What it is

`useEffect` is designed to *synchronize with an external system*. It is not a general-purpose lifecycle event. Using it for derived state computation, data fetching orchestration, or responding to events it shouldn't own produces unnecessary complexity and bugs.

### Wrong use 1 — derived state in an effect

```tsx
// Bad: uses an effect to compute something that is pure derivation
const [filtered, setFiltered] = useState([])
useEffect(() => {
  setFiltered(items.filter(i => i.active))
}, [items])
// This causes an extra render on every items change
```

```tsx
// Good: compute during render — no effect needed
const filtered = useMemo(() => items.filter(i => i.active), [items])
```

### Wrong use 2 — event response in an effect

```tsx
// Bad: effect watching state to "respond" to a button click
useEffect(() => {
  if (submitted) {
    sendForm(data)
    setSubmitted(false)
  }
}, [submitted])
```

```tsx
// Good: put the logic in the event handler directly
function handleSubmit() {
  sendForm(data)
}
```

### Wrong use 3 — data fetching without cleanup

```tsx
useEffect(() => {
  fetch(`/api/user/${id}`)
    .then(r => r.json())
    .then(setUser)
  // no cleanup — race condition + memory leak if component unmounts
}, [id])
```

```tsx
// Good: AbortController cleanup
useEffect(() => {
  const ctrl = new AbortController()
  fetch(`/api/user/${id}`, { signal: ctrl.signal })
    .then(r => r.json())
    .then(setUser)
    .catch(err => { if (err.name !== 'AbortError') throw err })
  return () => ctrl.abort()
}, [id])
```

### Detection signal

An effect that calls a `set` function without reading any external system (timer, socket, DOM API, third-party lib). That's almost always derived state or event logic that belongs elsewhere. The React docs phrase it well: *if you're not synchronizing with an external system, you probably don't need an effect.*

---

## 5. Race conditions in async flows

### What it is

Multiple in-flight requests, where an earlier request resolves after a later one, causing stale data to overwrite the correct result. No error is thrown. The UI shows wrong data with no indication anything went wrong.

### Classic scenario

User types "re" → request 1 fires (slow, 1.4s). User types "react" → request 2 fires (fast, 0.8s). Request 2 resolves first showing correct results. Request 1 resolves last and overwrites them with stale results for "re".

### Bad

```tsx
useEffect(() => {
  fetch(`/search?q=${query}`)
    .then(r => r.json())
    .then(setResults) // always runs — no guard
}, [query])
```

### Good — ignore flag (simplest)

```tsx
useEffect(() => {
  let ignore = false
  fetch(`/search?q=${query}`)
    .then(r => r.json())
    .then(data => {
      if (!ignore) setResults(data)
    })
  return () => { ignore = true }
}, [query])
```

### Good — AbortController (cancels network request too)

```tsx
useEffect(() => {
  const ctrl = new AbortController()
  fetch(`/search?q=${query}`, { signal: ctrl.signal })
    .then(r => r.json())
    .then(setResults)
    .catch(err => { if (err.name !== 'AbortError') throw err })
  return () => ctrl.abort()
}, [query])
```

### Detection signal

Any `useEffect` that fires an async operation based on a dep that can change rapidly (search input, route param, selected item ID) without a cleanup function. Also: any async operation that calls `setState` at the end without checking whether the component is still mounted.

---

## 6. State mutation

### What it is

Modifying state objects or arrays in place instead of producing a new reference. React uses `Object.is` to detect changes. If the reference doesn't change, React skips the re-render. The mutation happened but nothing updates.

### Bad

```tsx
const [items, setItems] = useState([])

function addItem(item) {
  items.push(item) // mutates existing array
  setItems(items) // same reference — React bails out, no re-render
}

function updateUser(id, changes) {
  const user = users.find(u => u.id === id)
  Object.assign(user, changes) // mutates in place
  setUsers(users) // same reference
}
```

### Good

```tsx
function addItem(item) {
  setItems(prev => [...prev, item]) // new array — React detects the change
}

function updateUser(id, changes) {
  setUsers(prev =>
    prev.map(u => u.id === id ? { ...u, ...changes } : u)
  )
}
```

### Detection signal

Any `array.push`, `array.splice`, `Object.assign(stateObject, ...)`, or direct property assignment (`state.field = value`) followed by a setter call. In complex nested state, consider `useImmer` which enforces immutability at the API level.

---

## 7. `useState` set function timing

### What it is

`setState` is asynchronous with respect to the current execution context. Reading state immediately after calling the setter returns the old value. Multiple sequential setters in one event handler don't stack — they batch, each reading the same stale base state.

### Bad

```tsx
function handleClick() {
  setCount(count + 1)
  setCount(count + 1) // both read the same `count` — net result: +1 not +2
  console.log(count)  // still old value
}
```

### Good

```tsx
// Functional updater always receives the latest queued value
function handleClick() {
  setCount(c => c + 1)
  setCount(c => c + 1) // correctly queues: c + 1 + 1 = +2
}
```

### Detection signal

Multiple sequential `setState` calls in one handler where each call depends on the previous result. Or `console.log(state)` right after `setState` and wondering why it shows the old value — classic trap.

---

## 8. `useReducer` reducer impurity

### What it is

`useReducer` reducers must be pure functions. In Strict Mode, React calls them twice to detect side effects. If a reducer performs mutations, API calls, or reads from outside the function, it will behave differently in development vs production and cause double-execution bugs.

### Bad

```tsx
function reducer(state, action) {
  if (action.type === 'add') {
    state.items.push(action.item) // mutation
    analytics.track('item_added')  // side effect
    return state // same reference
  }
}
```

### Good

```tsx
function reducer(state, action) {
  switch (action.type) {
    case 'add':
      return { ...state, items: [...state.items, action.item] }
    default:
      return state
  }
  // side effects (analytics etc.) belong in the event handler that dispatches
}
```

### Detection signal

Any mutation or I/O inside a reducer function. Reducers are pure state machines — they take state + action, return next state, do nothing else.

---

## 9. `useRef` misuse — triggering renders via ref writes

### What it is

`useRef` returns a mutable container whose `.current` changes do not trigger re-renders. This is intentional — refs are for values that *should not* drive the UI. Writing render-driving values into a ref instead of state produces a UI that never updates. The inverse — storing ephemeral values in state — causes unnecessary re-renders.

### Bad — render-driving value in a ref

```tsx
const countRef = useRef(0)

function increment() {
  countRef.current++ // no re-render — UI never updates
}

return <div>{countRef.current}</div> // always shows 0
```

### Bad — ephemeral value in state

```tsx
const [scrollY, setScrollY] = useState(0)
useEffect(() => {
  window.addEventListener('scroll', () => setScrollY(window.scrollY))
  // fires setState on every scroll pixel — massive re-render churn
  // if scrollY doesn't drive the UI directly, use a ref instead
}, [])
```

### Good — ref for latest value without re-render

```tsx
// Pattern: ref mirrors state to give effects the latest value
// without adding it to the effect's dep array
const [query, setQuery] = useState('')
const queryRef = useRef(query)
useEffect(() => { queryRef.current = query }, [query])

useEffect(() => {
  const id = setInterval(() => {
    if (queryRef.current) doSomething()
  }, 500)
  return () => clearInterval(id)
}, []) // intentionally stable — reads via ref
```

### Detection signal

A ref whose `.current` is read in JSX (should be state). Or a state variable that changes at high frequency but whose value isn't directly used to render anything (should be a ref).

---

## 10. `useCallback` and `useMemo` applied blindly

### What it is

Both hooks have a cost: they allocate memory to cache the value, and React still runs the hook on every render to check deps. Applied to cheap operations or functions that are never passed as props/deps, they add cost rather than reduce it.

The React Compiler (introduced in React 19) now handles memoization automatically when opted in — manually wrapping everything in `useCallback`/`useMemo` in a Compiler-enabled codebase is actively counterproductive.

### Bad

```tsx
// Wrapping a primitive computation that takes microseconds
const doubled = useMemo(() => count * 2, [count])

// Wrapping a function that is never passed to memo'd children or effects
const handleLocalClick = useCallback(() => {
  setOpen(true)
}, [])
```

### Good — only memoize when there is a concrete reason

```tsx
// Reason 1: expensive computation
const sorted = useMemo(
  () => largeList.sort(complexComparator),
  [largeList]
)

// Reason 2: passed to memo'd child
const onSubmit = useCallback((data) => {
  post('/api', data)
}, []) // stable — ShippingForm is wrapped in memo

return <ShippingForm onSubmit={onSubmit} />
```

### Detection signal

`useCallback` on a function that is neither passed to a `memo`-wrapped component nor listed as a dep of another hook. `useMemo` on a computation that a profiler shows takes under 1ms. These are noise, not optimization.

---

## 11. `useContext` — consuming the wrong level or missing provider

### What it is

`useContext` always finds the *closest* provider above the calling component. A component outside the provider tree reads the static `defaultValue` passed to `createContext`, not any live state. This fails silently — the component renders with the default value rather than throwing.

### Bad

```tsx
const ThemeContext = createContext(null) // default: null

function App() {
  return (
    <>
      <ThemeContext value="dark">
        <Page />
      </ThemeContext>
      <Sidebar /> {/* outside provider — gets null, not "dark" */}
    </>
  )
}

function Sidebar() {
  const theme = useContext(ThemeContext) // null — silent wrong value
  return <div className={`sidebar-${theme}`} /> // "sidebar-null"
}
```

### Good

```tsx
const ThemeContext = createContext('light') // meaningful default

// Wrap at the highest needed level
function App() {
  return (
    <ThemeContext value="dark">
      <Page />
      <Sidebar />
    </ThemeContext>
  )
}
```

Also note: `memo` does not prevent a context consumer from re-rendering. If a child is wrapped in `memo` but consumes a context that changes, it will still re-render. The only fix is to split the context so consumers only subscribe to the slice they need, or use a library that supports context selectors.

### Detection signal

`createContext(null)` or `createContext(undefined)` — the defaultValue should be a meaningful fallback, not null. Null defaults combined with missing providers produce runtime crashes or silently wrong renders with no error boundary involved.

---

## 12. `useActionState` and `useTransition` — Actions outside transitions

### What it is

React 19 introduced Actions: async functions called inside `startTransition`. `useActionState` wraps this pattern — it gives you state + pending flag + a dispatcher that must be called from within an Action (i.e., inside `startTransition`). Calling `dispatchAction` outside a transition causes a development error and breaks the pending state tracking.

### Bad

```tsx
const [state, dispatchAction, isPending] = useActionState(submitAction, null)

// calling dispatch directly outside startTransition
<button onClick={() => dispatchAction(formData)}>Submit</button>
// Error in dev: "An async function with useActionState was called outside of a transition."
```

### Good

```tsx
<button onClick={() => {
  startTransition(() => {
    dispatchAction(formData)
  })
}}>Submit</button>

// Or via form action prop (native integration)
<form action={dispatchAction}>...</form>
```

### The `await` trap in transitions

State updates that happen after an `await` inside `startTransition` are not automatically included in the transition:

```tsx
// Bad — setResult after await is NOT part of the transition
startTransition(async () => {
  const result = await saveData()
  setResult(result) // ← not treated as transition update
})

// Good — wrap the post-await update in another startTransition
startTransition(async () => {
  const result = await saveData()
  startTransition(() => {
    setResult(result) // ← now correctly part of the transition
  })
})
```

### Detection signal

`isPending` from `useActionState` or `useTransition` that never flips to `true`, or that flips but the UI still freezes. Usually means the async work is happening outside a transition context.

---

## 13. Key prop misuse

### What it is

React uses `key` to identify elements across renders. When the `key` changes, React unmounts the old element and mounts a fresh one, resetting all internal state. When the `key` is stable but the element moves position, state is preserved. Misusing keys produces either unnecessary remounts or accidental state preservation.

### Bad — using array index as key

```tsx
{items.map((item, i) => (
  <ItemCard key={i} item={item} />
))}
// If items are reordered, filtered, or prepended:
// React reuses the wrong component instance with stale state
// Text inputs, focus state, animations all misbehave
```

### Good — stable unique identity

```tsx
{items.map(item => (
  <ItemCard key={item.id} item={item} />
))}
```

### Good — deliberate reset via key change

```tsx
// Force full reset when userId changes (clears all internal state)
<UserProfile key={userId} userId={userId} />
```

### Detection signal

Array renders using index as key combined with any list that can be reordered, filtered, or paginated. Also: a component that should fully reset when a prop changes but doesn't — deliberate key change is the clean solution, not a cascade of `useEffect` calls that try to manually reset state.

---

## 14. Props drilling vs context vs atom state — choosing wrong

### What it is

This is an architecture-level bug rather than a code-level one, but it produces real symptoms: either excessive re-renders (all consumers re-render on any context change), prop hell (5+ levels of forwarding), or atom sprawl (too many fine-grained atoms causing synchronization complexity).

### Heuristics

| Scenario | Right tool |
| --- | --- |
| Value used by 1–2 closely related components | Props |
| Stable global config (theme, locale, feature flags) | Context |
| Frequently mutating shared state (user session, selections) | Zustand / Jotai atom |
| Server-derived data (API responses, cache) | TanStack Query / SWR |
| Complex multi-step UI state (forms, wizards) | `useReducer` local or Zustand slice |

### The Context performance trap

Context re-renders *every consumer* whenever the value changes, regardless of which part of the value the consumer reads. For anything that changes at moderate frequency, split into multiple contexts or switch to an atom library that supports subscriptions at the field level.

```tsx
// Bad: one large context — all consumers re-render on any change
const AppContext = createContext({ user, theme, cart, notifications })

// Good: split by change frequency
const UserContext = createContext(user)         // changes rarely
const CartContext = createContext(cart)         // changes on interactions
const ThemeContext = createContext(theme)       // changes rarely
```

### Detection signal

A context whose value is an object with more than 2–3 fields, where different consumers use different fields. Each consumer re-renders on every field change, not just the fields it uses.

---

## 15. Conditional hook calls

### What it is

Hooks must be called in the same order on every render. Calling a hook conditionally breaks the internal linked-list React uses to associate hook calls with their state slots. React throws in development, but the bug can slip through if the condition is subtle.

### Bad

```tsx
function UserCard({ user }) {
  if (!user) return null // early return before hooks
  const [open, setOpen] = useState(false) // hook after conditional return — illegal
}

function Dashboard({ isAdmin }) {
  if (isAdmin) {
    const data = useAdminData() // conditional hook call — illegal
  }
}
```

### Good

```tsx
function UserCard({ user }) {
  const [open, setOpen] = useState(false) // hooks always first
  if (!user) return null // conditional return after hooks
}

function Dashboard({ isAdmin }) {
  const adminData = useAdminData() // always call — guard the use, not the call
  // use adminData only when isAdmin
}
```

### Detection signal

An early `return` before any hook calls. Or a hook call inside an `if`, a `for`, or a nested function body. The `eslint-plugin-react-hooks` `rules-of-hooks` lint rule catches this — never suppress it.

---

## Summary — quick mental model

The root cause of most React bugs is one of three things:

**Stale reference**: a value was captured at the wrong point in time. Closures, dep arrays, refs vs state.

**Wrong identity**: two values are semantically equal but not `===` equal (or vice versa). Inline objects, inline functions, selector output.

**Wrong tool**: using `useEffect` for derived state, using state for ephemeral values, using Context for high-frequency data, using index as key for dynamic lists.

Most bugs are silent. They don't throw — they just show wrong data, skip re-renders, or cause extra re-renders. The common thread is that React's model is designed around referential equality and pure functions, and every deviation from that, even a subtle one, can break the assumptions all the bailout and scheduling logic depends on.
