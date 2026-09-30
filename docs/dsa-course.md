# DSA in JavaScript (Updated)

**Changes from the previous version:** quickselect added (Module 12); expression evaluation added (Module 9); cyclic sort added (Module 13); Modules 32–34 marked ⭐ Optional; a **Practice** line added to every module with representative problems. The problem names are standard LeetCode titles, so you can search for them directly.

## === BEGINNER — FUNDAMENTALS ===

### PART 1 — Thinking Algorithmically

**Module 1 — How to Approach a Problem:** what a data structure is vs. what an algorithm is; reading a problem as input → output → constraints; writing your own examples and edge cases before coding; brute force first, then optimize; pseudocode; dry-running code by hand on paper; reading LeetCode-style problem statements and function signatures.
*Practice:* Take three easy problems and only write examples, edge cases and a brute-force plan in plain English, with no code.

**Module 2 — The Math You Actually Need:** exponents; logarithms as "how many times can I halve n" (log₂); the sum 1+2+…+n = n(n+1)/2; modulo (`%`) and its negative-number behavior in JS; `Math.floor` vs `Math.trunc`; integer safety (`Number.MAX_SAFE_INTEGER`); floating-point traps (`0.1 + 0.2`); 🔹 `BigInt` (only for overflow problems).
*Practice:* Fizz Buzz, Palindrome Number, Missing Number (solve it with the sum formula).

**Module 3 — Complexity Analysis (Big-O)** *(prereq: Module 2)*: time vs. space complexity; the common classes O(1), O(log n), O(n), O(n log n), O(n²), O(2ⁿ), O(n!); counting work in single, nested and sequential loops; dropping constants and lower-order terms; best, average and worst case; amortized cost (why `push` is O(1)); space used by the recursion stack; using input constraints to guess the target complexity (e.g., n ≤ 10⁵ → aim for O(n log n)); 🔹 Big-Θ / Big-Ω (recognition only).
*Practice:* For every problem you solve from here on, write its time and space complexity as a comment before running it.

**Module 4 — JavaScript's Built-ins Through a DSA Lens** *(prereq: Module 3)*:
- Array costs: `push`/`pop` are O(1); `shift`/`unshift`/`splice` are O(n); `slice`, `concat` and spread all copy, so they are O(n); `includes`/`indexOf` are O(n).
- Strings are immutable. Build them in loops with an array plus `join`.
- Default `sort` compares as strings, so always pass a comparator like `(a, b) => a - b`. It is stable and O(n log n). `toSorted`/`toReversed` are the non-mutating versions.
- Use `Map`/`Set` rather than plain objects as hash tables.
- Watch the shared-reference trap: `Array(n).fill([])` puts the same array in every slot. Use `Array.from({length: n}, () => [])` instead.
- JS has no built-in queue, heap or tree.
- Recursion depth is limited to roughly 10k frames, and V8 has no tail-call optimization.

*Practice:* Time `shift()` vs. `pop()` on an array of one million items. Sort `[10, 9, 1]` with and without a comparator, and reproduce the `fill([])` bug yourself.

### PART 2 — Linear Data Structures

**Module 5 — Arrays & Matrices:** how arrays sit contiguously in memory (concept); static vs. dynamic arrays; traversal and in-place modification; reversing and rotating; 2D arrays: creation, row/column traversal, bounds checking, diagonal traversal.
*Practice:* Best Time to Buy and Sell Stock, Rotate Array, Transpose Matrix, Spiral Matrix, Rotate Image.

**Module 6 — Strings:** character codes (`charCodeAt`, `String.fromCharCode`); frequency counting with a 26-slot array; palindrome checks; anagram checks; the cost of `split`/`join`/substring operations; 🔹 Unicode surrogate pairs (emoji length gotcha).
*Practice:* Valid Palindrome, Valid Anagram, Reverse Words in a String, Longest Common Prefix.

**Module 7 — Hash Maps & Sets:** hashing and collisions (concept); why lookups are O(1) on average and what the worst case is; the four core uses: frequency counting, "have I seen this?", grouping (e.g., group anagrams) and complement lookup (two-sum); pitfall: object and array keys compare by reference, so convert them to a string key; 🔹 `Object.groupBy` / `Map.groupBy`; 🔹 Set methods (`union`, `intersection`).
*Practice:* Two Sum, Contains Duplicate, Group Anagrams, Top K Frequent Elements (solve it with a map plus sort for now), Longest Consecutive Sequence.

**Module 8 — Linked Lists:** nodes and pointers using JS classes; singly vs. doubly linked; traverse, insert and delete; reversing a list (iterative and recursive); the dummy/sentinel node technique; fast and slow pointers (finding the middle, Floyd's cycle detection); merging two sorted lists; common mistakes: losing the next reference, missing `null` checks.
*Practice:* Reverse Linked List, Merge Two Sorted Lists, Linked List Cycle, Middle of the Linked List, Remove Nth Node From End of List, Reorder List.

**Module 9 — Stacks & Queues:** stack via array; why an array-based queue using `shift` is O(n) per dequeue; O(1) queue via a head index or a linked list; 🔹 deque (implement once); applications: balanced parentheses, undo/redo, BFS preview; expression evaluation: postfix (Reverse Polish Notation) and infix evaluation with a stack (handling operators, precedence and parentheses).
*Practice:* Valid Parentheses, Min Stack, Implement Queue using Stacks, Evaluate Reverse Polish Notation, Basic Calculator II.

### PART 3 — Recursion & Classic Algorithms

**Module 10 — Recursion** *(prereq: Module 9, since the call stack is a stack)*: base case and recursive case; visualizing the call stack; drawing recursion trees to count work; stack overflow; recursion vs. iteration; converting recursion to an explicit stack.
*Practice:* Power of Two, Pow(x, n), Reverse Linked List (recursive), Fibonacci Number (draw its recursion tree and count the calls).

**Module 11 — Searching:** linear search; binary search on sorted arrays; loop templates (`lo <= hi` vs. `lo < hi`) and when to use each; computing mid (`Math.floor` / `>> 1`); off-by-one debugging; lower bound and upper bound (first/last occurrence).
*Practice:* Binary Search, Search Insert Position, First Bad Version, Find First and Last Position of Element in Sorted Array, Sqrt(x).

**Module 12 — Sorting & Selection** *(prereq: Module 10)*: bubble, selection and insertion sort (understand them and why they are O(n²), don't memorize); merge sort (divide and conquer); quicksort (partitioning, pivot choice, worst case); quickselect (finding the kth smallest/largest in average O(n) by reusing quicksort's partition; random pivots to avoid the worst case); stability and why it matters; when to just use the built-in sort; 🔹 counting sort (small value ranges).
*Practice:* Sort an Array (implement merge sort and quicksort yourself), Sort Colors, Merge Sorted Array, Kth Largest Element in an Array (solve with quickselect).

## === INTERMEDIATE — ESSENTIAL+ ===

### PART 4 — Core Problem-Solving Patterns

**Module 13 — Two Pointers & Cyclic Sort:** pointers at opposite ends (pair sum in a sorted array, container with most water); same-direction pointers (remove duplicates in place, move zeroes); three-way partition (Dutch national flag); 3Sum with duplicate skipping; cyclic sort: when values fall in a range like 1..n, swap each number into its "correct" index, then scan for the misplaced ones (missing, duplicate and first-missing-positive problems).
*Practice:* Two Sum II, Move Zeroes, Container With Most Water, 3Sum, Find All Numbers Disappeared in an Array, Find the Duplicate Number, First Missing Positive.

**Module 14 — Sliding Window** *(prereq: Modules 7, 13)*: fixed-size windows; variable-size windows with a `Map` of counts; the expand/shrink template; longest substring without repeats; minimum window substring; common mistake: updating the answer at the wrong moment.
*Practice:* Maximum Average Subarray I, Longest Substring Without Repeating Characters, Longest Repeating Character Replacement, Permutation in String, Minimum Window Substring.

**Module 15 — Prefix Sums & Difference Arrays:** range-sum queries in O(1); prefix sum plus hash map (subarray sum equals k); difference arrays for range updates; 🔹 2D prefix sums.
*Practice:* Range Sum Query – Immutable, Product of Array Except Self, Subarray Sum Equals K, Continuous Subarray Sum, Car Pooling.

**Module 16 — Binary Search, Advanced** *(prereq: Module 11)*: searching on a monotonic yes/no condition; rotated sorted arrays; binary search on the answer (minimum capacity, minimum speed type problems); peak finding.
*Practice:* Search in Rotated Sorted Array, Find Minimum in Rotated Sorted Array, Find Peak Element, Koko Eating Bananas, Capacity To Ship Packages Within D Days.

**Module 17 — Monotonic Stack & Queue:** next greater/smaller element; daily temperatures; largest rectangle in a histogram; sliding window maximum with a monotonic deque.
*Practice:* Next Greater Element I, Daily Temperatures, Online Stock Span, Largest Rectangle in Histogram, Sliding Window Maximum.

### PART 5 — Trees

**Module 18 — Binary Trees** *(prereq: Modules 9, 10)*: terminology (root, leaf, depth, height, balanced); a `TreeNode` class; DFS traversals (preorder, inorder, postorder), both recursive and iterative; BFS level-order with a queue; height, diameter and path sums; building a tree from LeetCode's array format for testing.
*Practice:* Maximum Depth of Binary Tree, Invert Binary Tree, Same Tree, Binary Tree Level Order Traversal, Diameter of Binary Tree, Path Sum II, Binary Tree Right Side View.

**Module 19 — Binary Search Trees:** the BST property; search, insert and delete; inorder traversal gives sorted order; validating a BST; kth smallest element; lowest common ancestor; why unbalanced BSTs degrade to O(n); 🔹 AVL / Red-Black trees (recognition: they exist to stay balanced).
*Practice:* Search in a BST, Insert into a BST, Delete Node in a BST, Validate Binary Search Tree, Kth Smallest Element in a BST, Lowest Common Ancestor of a BST.

**Module 20 — Heaps & Priority Queues:** a heap as a complete binary tree stored in an array; parent/child index math; sift-up and sift-down; heapify in O(n); writing your own `MinHeap` class with a comparator (essential in JS since there's no built-in); top-k problems (heap vs. quickselect trade-offs); merging k sorted lists; median of a stream with two heaps; note: LeetCode preloads `@datastructures-js/priority-queue`, but you should be able to write your own.
*Practice:* Kth Largest Element in a Stream, Last Stone Weight, K Closest Points to Origin, Top K Frequent Elements (solve it again with a heap), Merge k Sorted Lists, Find Median from Data Stream.

**Module 21 — Tries:** node structure (`Map` or fixed array of children); insert, search and `startsWith`; autocomplete; word search with a trie plus backtracking (after Module 27).
*Practice:* Implement Trie (Prefix Tree), Design Add and Search Words Data Structure, Search Suggestions System, Word Search II (after Module 27).

### PART 6 — Graphs

**Module 22 — Graph Representations:** vertices and edges; directed vs. undirected; weighted vs. unweighted; adjacency list (the default), adjacency matrix, edge list; building a graph from an edge list; grids as implicit graphs using a directions array.
*Practice:* Find Center of Star Graph, Find if Path Exists in Graph. Also convert three different edge lists into adjacency lists by hand.

**Module 23 — Graph Traversal** *(prereq: Modules 18, 22)*: DFS (recursive and iterative) and BFS; the `visited` set (mark on push vs. on pop); connected components; number of islands and flood fill; cycle detection (undirected; directed using three-color marking); bipartite checks.
*Practice:* Flood Fill, Number of Islands, Max Area of Island, Clone Graph, Pacific Atlantic Water Flow, Is Graph Bipartite?

**Module 24 — Shortest Paths & Ordering** *(prereq: Modules 20, 23)*: BFS gives shortest path in unweighted graphs; multi-source BFS; topological sort (Kahn's algorithm and the DFS approach); course-schedule style problems; Dijkstra's algorithm with your heap; 🔹 Bellman-Ford (negative edges); 🔹 0-1 BFS.
*Practice:* Rotting Oranges, Shortest Path in Binary Matrix, Word Ladder, Course Schedule, Course Schedule II, Network Delay Time.

**Module 25 — Union-Find (Disjoint Set Union):** parent array; find with path compression; union by rank/size; counting components dynamically; redundant connection; Kruskal's minimum spanning tree; 🔹 Prim's algorithm.
*Practice:* Number of Provinces, Redundant Connection, Accounts Merge, Min Cost to Connect All Points.

### PART 7 — Greedy & Backtracking

**Module 26 — Greedy Algorithms** *(prereq: Modules 12, 20)*: what makes greedy valid (the exchange-argument intuition); testing a greedy idea with counterexamples; interval problems: merge intervals, insert interval, non-overlapping intervals, meeting rooms (heap-based); jump game; gas station; task scheduling.
*Practice:* Maximum Subarray (Kadane's), Jump Game, Jump Game II, Gas Station, Merge Intervals, Insert Interval, Non-overlapping Intervals, Task Scheduler.

**Module 27 — Backtracking** *(prereq: Module 10)*: the choose → explore → un-choose template; subsets, permutations and combinations; combination sum; handling duplicates by sorting and skipping; pruning; N-Queens; word search on a grid; pitfall: pushing `path` instead of `[...path]` (shared reference).
*Practice:* Subsets, Subsets II, Permutations, Combination Sum, Letter Combinations of a Phone Number, Palindrome Partitioning, Word Search, N-Queens.

## === ADVANCED — MASTERY ===

### PART 8 — Dynamic Programming

**Module 28 — DP Foundations** *(prereq: Modules 10, 27)*: overlapping subproblems and optimal substructure; the progression from recursion to memoization (top-down) to tabulation (bottom-up) to space optimization; defining the state, the transition and the base cases; Fibonacci, climbing stairs, house robber.
*Practice:* Climbing Stairs, Min Cost Climbing Stairs, House Robber, House Robber II, Decode Ways. Solve each one all four ways: plain recursion, memoized, tabulated and space-optimized.

**Module 29 — Core DP Families:** coin change (min coins, number of ways); longest increasing subsequence (O(n²) and the O(n log n) binary-search version); grid paths and minimum path sum; longest common subsequence; edit distance; 0/1 knapsack and unbounded knapsack; partition equal subset sum; word break.
*Practice:* Coin Change, Coin Change II, Longest Increasing Subsequence, Unique Paths, Minimum Path Sum, Longest Common Subsequence, Edit Distance, Partition Equal Subset Sum, Word Break.

**Module 30 — Advanced DP Patterns:** interval DP (palindromic substrings, burst balloons); state-machine DP (stock buy/sell family); DP on trees (house robber III, max path sum); DP combined with binary search; 🔹 bitmask DP (n ≤ ~20); 🔹 digit DP.
*Practice:* Longest Palindromic Substring, Palindromic Substrings, Best Time to Buy and Sell Stock with Cooldown, House Robber III, Binary Tree Maximum Path Sum, Burst Balloons.

### PART 9 — Advanced Structures & Techniques

**Module 31 — Bit Manipulation & Number Basics:** AND, OR, XOR, NOT and the shift operators; the JS gotcha that bitwise operators work on 32-bit signed integers (`>>>` for unsigned); tricks: `x & (x - 1)`, power-of-two checks, single number via XOR, counting bits, enumerating subsets with masks; GCD (Euclid); Sieve of Eratosthenes; modular arithmetic with 10⁹+7; fast exponentiation (`BigInt` when products overflow).
*Practice:* Single Number, Number of 1 Bits, Counting Bits, Reverse Bits, Missing Number (solve it again with XOR), Count Primes, Greatest Common Divisor of Strings.

**Module 32 — Range Query Structures** ⭐ *Optional: mainly competitive programming, rarely asked in interviews* *(prereq: Modules 15, 18)*: Fenwick tree (Binary Indexed Tree) for prefix sums with updates; segment tree: build, query, point update; choosing between the two; 🔹 lazy propagation (range updates).
*Practice:* Range Sum Query – Mutable, Count of Smaller Numbers After Self.

**Module 33 — Advanced Graph Algorithms** ⭐ *Optional: mainly competitive programming, rarely asked in interviews* *(prereq: Modules 24, 25)*: Dijkstra variants (extra state such as "k stops", path reconstruction); MST in depth (Kruskal vs. Prim trade-offs); 🔹 strongly connected components (Kosaraju/Tarjan); 🔹 bridges and articulation points; 🔹 A* search.
*Practice:* Cheapest Flights Within K Stops, Path With Minimum Effort, Swim in Rising Water, Critical Connections in a Network.

**Module 34 — String Algorithms** ⭐ *Optional: mainly competitive programming, rarely asked in interviews*: rolling hash (Rabin-Karp) and collision handling; KMP and the prefix function; 🔹 Z-algorithm; 🔹 Manacher's algorithm.
*Practice:* Find the Index of the First Occurrence in a String (solve it with KMP), Repeated String Match, Shortest Palindrome.

**Module 35 — Data Structure Design:** LRU cache (hash map plus doubly linked list; also the `Map`-insertion-order shortcut in JS); min stack; time-based key-value store; insert/delete/getRandom in O(1); iterator design; clean class design for DSA in JS; 🔹 LFU cache.
*Practice:* LRU Cache, Time Based Key-Value Store, Insert Delete GetRandom O(1), Design Twitter, Flatten Nested List Iterator.

### PART 10 — Mastery Practice

**Module 36 — Professional Problem-Solving Process:**
- Pattern recognition from constraints and problem wording.
- The full interview framework: clarify → examples → brute force → optimize → code → test → analyze.
- Justifying complexity out loud.
- Systematic edge-case testing: empty input, one element, duplicates, negatives, maximum sizes.
- Debugging with the Node debugger and `console.table`.
- Writing a small test harness with `node:test`.
- Timed practice and explaining your reasoning.

*Practice:* Work through a full curated list (NeetCode 150 or Grind 75) with problems mixed together, so you must identify the pattern yourself. Do mock interviews where you explain your approach aloud.

**Module 37 — Performance-Aware JavaScript:** typed arrays (`Int32Array`, `Float64Array`) for speed and memory; preallocating arrays; avoiding object creation in hot loops; iterative instead of recursive code for deep inputs; 🔹 fast input reading in Node for competitive-programming judges.
*Practice:* Re-solve three of your slowest past solutions using typed arrays and preallocation, and compare their runtimes.

## How to Practice (applies to every module)
- **Attempt before you look.** Make a genuine attempt at each problem before reading hints or solutions.
- **Study, then re-solve.** When you look at a solution, understand why it works, then re-solve the problem from scratch days later without help.
- **Keep a mistake log:** the problem, the idea you missed and the pattern it belongs to. Review it regularly.
- **Mix old problems into new sessions** so earlier patterns stay fresh.

## Capstone Projects
- **Beginner:** Your own DSA library in JS: `LinkedList`, `Stack`, `Queue` (O(1) dequeue), merge sort, quicksort, quickselect and binary search. Every function gets a complexity comment and tests written with `node:test`.
- **Intermediate:** A terminal route planner. It loads a city map from JSON as a weighted graph, finds shortest routes with Dijkstra using your own `MinHeap`, and autocompletes city names with a Trie.
- **Advanced:** A mini search and spell-check engine. It indexes a text corpus with a Trie, gives "did you mean" suggestions using edit-distance DP, caches queries with an LRU cache and ranks the top-k results with a heap. It is benchmarked against naive versions. *(Optional extension: range statistics with a Fenwick tree.)*

## Final Skills
- **After Beginner:** Analyze any code's time and space complexity. Know the true cost of JS built-ins. Implement linked lists, stacks, queues and hash-based solutions. Write recursion confidently. Implement binary search, merge/quick sort and quickselect from scratch. Solve most "easy" interview problems.
- **After Intermediate:** Recognize and apply the major patterns (two pointers, cyclic sort, sliding window, prefix sums, monotonic stack, BFS/DFS, heaps, tries, union-find, greedy, backtracking). Solve most "medium" problems and model real problems as graphs or trees.
- **After Advanced:** Break down and solve DP problems systematically. Design custom data structures. Handle "hard" problems and perform well in technical interviews at demanding companies. With the ⭐ optional modules, you'll also be ready to start competitive programming.

## === NOT COVERED / DEFERRED ===
Suffix arrays and suffix trees; suffix automaton; Aho-Corasick; heavy-light decomposition; centroid decomposition; persistent data structures; treaps, splay trees and skip lists; B-trees and B+ trees; implementing Red-Black / AVL trees; network flow (Ford-Fulkerson, Edmonds-Karp, Dinic); bipartite matching (Hopcroft-Karp, Hungarian algorithm); Floyd-Warshall in depth; FFT / NTT; computational geometry (convex hull, line sweep); advanced number theory (modular inverse, CRT, Miller-Rabin); Mo's algorithm; sqrt decomposition; matrix exponentiation; DP optimizations (convex hull trick, Knuth, divide-and-conquer DP); game theory (Sprague-Grundy); randomized algorithms; approximation algorithms; NP-completeness and reductions; formal amortized analysis (potential method); cache-oblivious and external-memory algorithms; concurrent and lock-free data structures.
