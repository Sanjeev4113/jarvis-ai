/**
 * The DSA path: 30 days from basics to advanced. Each day has a concept, the core ideas, a pattern template and
 * 3 LeetCode problems with test cases so they can be solved in the in-app practice window (JavaScript).
 * Arguments marked "list"/"tree" are converted to ListNode/TreeNode before the call (LeetCode style);
 * "treeNode" passes the node with that value from the first tree argument.
 */

export type Arg = "list" | "tree" | "treeNode" | null;
export type Compare = "exact" | "unordered" | "deepUnordered" | "float" | "topo" | "kClosest";
export type Test = { args: unknown[]; expect: unknown };
export type Problem = {
  slug: string;
  title: string;
  diff: "Easy" | "Medium" | "Hard";
  fn: string;
  params: string[];
  tests: Test[];
  argTypes?: Arg[];
  /** list/tree: convert the returned node; val: return node → its val; arg0: in-place, compare the first argument */
  out?: "list" | "tree" | "val" | "arg0";
  compare?: Compare;
  note?: string;
};
export type Day = { day: number; topic: string; ideas: string[]; pattern: string; problems: Problem[] };

const P = (slug: string, title: string, diff: Problem["diff"], fn: string, params: string[], tests: [unknown[], unknown][], o: Partial<Problem> = {}): Problem => ({
  slug,
  title,
  diff,
  fn,
  params,
  tests: tests.map(([args, expect]) => ({ args, expect })),
  ...o,
});

export const DSA: Day[] = [
  {
    day: 1,
    topic: "Arrays & Big-O",
    ideas: ["Big-O counts how work grows with input size: O(1), O(log n), O(n), O(n log n), O(n²).", "Arrays give O(1) index access; inserting in the middle is O(n).", "A single pass with a hash map often turns O(n²) into O(n)."],
    pattern: "const seen = new Map();\nfor (let i = 0; i < a.length; i++) {\n  if (seen.has(target - a[i])) return [seen.get(target - a[i]), i];\n  seen.set(a[i], i);\n}",
    problems: [
      P("two-sum", "Two Sum", "Easy", "twoSum", ["nums", "target"], [[[[2, 7, 11, 15], 9], [0, 1]], [[[3, 2, 4], 6], [1, 2]], [[[3, 3], 6], [0, 1]]], { compare: "unordered" }),
      P("best-time-to-buy-and-sell-stock", "Best Time to Buy and Sell Stock", "Easy", "maxProfit", ["prices"], [[[[7, 1, 5, 3, 6, 4]], 5], [[[7, 6, 4, 3, 1]], 0], [[[2, 4, 1]], 2]]),
      P("contains-duplicate", "Contains Duplicate", "Easy", "containsDuplicate", ["nums"], [[[[1, 2, 3, 1]], true], [[[1, 2, 3, 4]], false], [[[1, 1, 1, 3, 3, 4, 3, 2, 4, 2]], true]]),
    ],
  },
  {
    day: 2,
    topic: "Strings",
    ideas: ["Strings are immutable in JS/Java: build with arrays / StringBuilder.", "Frequency counts (26-length arrays) solve most anagram questions.", "Two indices from both ends check palindromes in O(n)."],
    pattern: "const count = new Array(26).fill(0);\nfor (const c of s) count[c.charCodeAt(0) - 97]++;",
    problems: [
      P("valid-anagram", "Valid Anagram", "Easy", "isAnagram", ["s", "t"], [[["anagram", "nagaram"], true], [["rat", "car"], false], [["a", "ab"], false]]),
      P("valid-palindrome", "Valid Palindrome", "Easy", "isPalindrome", ["s"], [[["A man, a plan, a canal: Panama"], true], [["race a car"], false], [[" "], true]]),
      P("longest-common-prefix", "Longest Common Prefix", "Easy", "longestCommonPrefix", ["strs"], [[[["flower", "flow", "flight"]], "fl"], [[["dog", "racecar", "car"]], ""], [[["a"]], "a"]]),
    ],
  },
  {
    day: 3,
    topic: "Hashing",
    ideas: ["Hash maps give average O(1) insert/lookup.", "Use a canonical key (sorted word, count signature) to group items.", "Sets answer 'have I seen this?' and 'is x+1 present?' instantly."],
    pattern: "const groups = new Map();\nfor (const w of words) {\n  const key = [...w].sort().join('');\n  (groups.get(key) ?? groups.set(key, []).get(key)).push(w);\n}",
    problems: [
      P("group-anagrams", "Group Anagrams", "Medium", "groupAnagrams", ["strs"], [[[["eat", "tea", "tan", "ate", "nat", "bat"]], [["bat"], ["nat", "tan"], ["ate", "eat", "tea"]]], [[[""]], [[""]]], [[["a"]], [["a"]]]], { compare: "deepUnordered" }),
      P("top-k-frequent-elements", "Top K Frequent Elements", "Medium", "topKFrequent", ["nums", "k"], [[[[1, 1, 1, 2, 2, 3], 2], [1, 2]], [[[1], 1], [1]], [[[4, 4, 5, 5, 5, 6], 1], [5]]], { compare: "unordered" }),
      P("longest-consecutive-sequence", "Longest Consecutive Sequence", "Medium", "longestConsecutive", ["nums"], [[[[100, 4, 200, 1, 3, 2]], 4], [[[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], 9], [[[]], 0]]),
    ],
  },
  {
    day: 4,
    topic: "Prefix Sums",
    ideas: ["prefix[i] = sum of a[0..i-1]; any range sum is prefix[r+1] - prefix[l].", "Count subarrays with sum k by storing how often each prefix sum appeared.", "Works for products, XOR and 2D grids too."],
    pattern: "let sum = 0, count = 0;\nconst freq = new Map([[0, 1]]);\nfor (const x of nums) {\n  sum += x;\n  count += freq.get(sum - k) ?? 0;\n  freq.set(sum, (freq.get(sum) ?? 0) + 1);\n}",
    problems: [
      P("running-sum-of-1d-array", "Running Sum of 1d Array", "Easy", "runningSum", ["nums"], [[[[1, 2, 3, 4]], [1, 3, 6, 10]], [[[1, 1, 1, 1, 1]], [1, 2, 3, 4, 5]], [[[3, 1, 2, 10, 1]], [3, 4, 6, 16, 17]]]),
      P("find-pivot-index", "Find Pivot Index", "Easy", "pivotIndex", ["nums"], [[[[1, 7, 3, 6, 5, 6]], 3], [[[1, 2, 3]], -1], [[[2, 1, -1]], 0]]),
      P("subarray-sum-equals-k", "Subarray Sum Equals K", "Medium", "subarraySum", ["nums", "k"], [[[[1, 1, 1], 2], 2], [[[1, 2, 3], 3], 2], [[[1, -1, 0], 0], 3]]),
    ],
  },
  {
    day: 5,
    topic: "Two Pointers",
    ideas: ["On sorted data, move left/right pointers toward each other based on a comparison.", "Skip duplicates to avoid repeated answers.", "Fast/slow pointers detect cycles and middles."],
    pattern: "let l = 0, r = a.length - 1;\nwhile (l < r) {\n  const s = a[l] + a[r];\n  if (s === target) return [l, r];\n  s < target ? l++ : r--;\n}",
    problems: [
      P("two-sum-ii-input-array-is-sorted", "Two Sum II", "Medium", "twoSum", ["numbers", "target"], [[[[2, 7, 11, 15], 9], [1, 2]], [[[2, 3, 4], 6], [1, 3]], [[[-1, 0], -1], [1, 2]]], { note: "Return 1-indexed positions." }),
      P("3sum", "3Sum", "Medium", "threeSum", ["nums"], [[[[-1, 0, 1, 2, -1, -4]], [[-1, -1, 2], [-1, 0, 1]]], [[[0, 1, 1]], []], [[[0, 0, 0]], [[0, 0, 0]]]], { compare: "deepUnordered" }),
      P("container-with-most-water", "Container With Most Water", "Medium", "maxArea", ["height"], [[[[1, 8, 6, 2, 5, 4, 8, 3, 7]], 49], [[[1, 1]], 1], [[[4, 3, 2, 1, 4]], 16]]),
    ],
  },
  {
    day: 6,
    topic: "Sliding Window",
    ideas: ["Keep a window [l, r] and grow r; shrink l while the window breaks the rule.", "Fixed-size windows: add the new element, drop the old one.", "Track window state with a map or counter."],
    pattern: "let l = 0;\nconst last = new Map();\nfor (let r = 0; r < s.length; r++) {\n  if (last.has(s[r]) && last.get(s[r]) >= l) l = last.get(s[r]) + 1;\n  last.set(s[r], r);\n  best = Math.max(best, r - l + 1);\n}",
    problems: [
      P("maximum-average-subarray-i", "Maximum Average Subarray I", "Easy", "findMaxAverage", ["nums", "k"], [[[[1, 12, -5, -6, 50, 3], 4], 12.75], [[[5], 1], 5], [[[0, 1, 1, 3, 3], 4], 2]], { compare: "float" }),
      P("longest-substring-without-repeating-characters", "Longest Substring Without Repeating Characters", "Medium", "lengthOfLongestSubstring", ["s"], [[["abcabcbb"], 3], [["bbbbb"], 1], [["pwwkew"], 3]]),
      P("minimum-size-subarray-sum", "Minimum Size Subarray Sum", "Medium", "minSubArrayLen", ["target", "nums"], [[[7, [2, 3, 1, 2, 4, 3]], 2], [[4, [1, 4, 4]], 1], [[11, [1, 1, 1, 1, 1, 1, 1, 1]], 0]]),
    ],
  },
  {
    day: 7,
    topic: "Binary Search",
    ideas: ["Halve the search space each step: O(log n).", "Use lo + ((hi - lo) >> 1) and be precise about inclusive/exclusive bounds.", "Rotated arrays: one half is always sorted."],
    pattern: "let lo = 0, hi = a.length - 1;\nwhile (lo <= hi) {\n  const mid = lo + ((hi - lo) >> 1);\n  if (a[mid] === t) return mid;\n  a[mid] < t ? (lo = mid + 1) : (hi = mid - 1);\n}\nreturn -1;",
    problems: [
      P("binary-search", "Binary Search", "Easy", "search", ["nums", "target"], [[[[-1, 0, 3, 5, 9, 12], 9], 4], [[[-1, 0, 3, 5, 9, 12], 2], -1], [[[5], 5], 0]]),
      P("search-insert-position", "Search Insert Position", "Easy", "searchInsert", ["nums", "target"], [[[[1, 3, 5, 6], 5], 2], [[[1, 3, 5, 6], 2], 1], [[[1, 3, 5, 6], 7], 4]]),
      P("find-minimum-in-rotated-sorted-array", "Find Minimum in Rotated Sorted Array", "Medium", "findMin", ["nums"], [[[[3, 4, 5, 1, 2]], 1], [[[4, 5, 6, 7, 0, 1, 2]], 0], [[[11, 13, 15, 17]], 11]]),
    ],
  },
  {
    day: 8,
    topic: "Binary Search on the Answer",
    ideas: ["When answers are monotonic (if x works, x+1 works), binary search the answer itself.", "Write a feasible(x) check, then find the smallest feasible x.", "Classic for capacities, speeds, square roots."],
    pattern: "let lo = 1, hi = max;\nwhile (lo < hi) {\n  const mid = (lo + hi) >> 1;\n  feasible(mid) ? (hi = mid) : (lo = mid + 1);\n}\nreturn lo;",
    problems: [
      P("sqrtx", "Sqrt(x)", "Easy", "mySqrt", ["x"], [[[4], 2], [[8], 2], [[2147395599], 46339]]),
      P("koko-eating-bananas", "Koko Eating Bananas", "Medium", "minEatingSpeed", ["piles", "h"], [[[[3, 6, 7, 11], 8], 4], [[[30, 11, 23, 4, 20], 5], 30], [[[30, 11, 23, 4, 20], 6], 23]]),
      P("capacity-to-ship-packages-within-d-days", "Capacity To Ship Packages Within D Days", "Medium", "shipWithinDays", ["weights", "days"], [[[[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5], 15], [[[3, 2, 2, 4, 1, 4], 3], 6], [[[1, 2, 3, 1, 1], 4], 3]]),
    ],
  },
  {
    day: 9,
    topic: "Sorting",
    ideas: ["Know merge sort (stable, O(n log n)) and quicksort (in-place, average O(n log n)).", "Sort first to unlock greedy merges and two pointers.", "Dutch national flag: three pointers partition in one pass."],
    pattern: "intervals.sort((a, b) => a[0] - b[0]);\nconst out = [];\nfor (const [s, e] of intervals) {\n  if (out.length && s <= out.at(-1)[1]) out.at(-1)[1] = Math.max(out.at(-1)[1], e);\n  else out.push([s, e]);\n}",
    problems: [
      P("sort-colors", "Sort Colors", "Medium", "sortColors", ["nums"], [[[[2, 0, 2, 1, 1, 0]], [0, 0, 1, 1, 2, 2]], [[[2, 0, 1]], [0, 1, 2]], [[[0]], [0]]], { out: "arg0", note: "Sort nums in place (return nothing)." }),
      P("merge-intervals", "Merge Intervals", "Medium", "merge", ["intervals"], [[[[[1, 3], [2, 6], [8, 10], [15, 18]]], [[1, 6], [8, 10], [15, 18]]], [[[[1, 4], [4, 5]]], [[1, 5]]], [[[[1, 4], [0, 4]]], [[0, 4]]]]),
      P("kth-largest-element-in-an-array", "Kth Largest Element in an Array", "Medium", "findKthLargest", ["nums", "k"], [[[[3, 2, 1, 5, 6, 4], 2], 5], [[[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], 4], [[[1], 1], 1]]),
    ],
  },
  {
    day: 10,
    topic: "Stacks",
    ideas: ["LIFO: push opening things, pop when they close.", "Stacks evaluate expressions and undo history.", "A stack of indices finds the next greater element in one pass."],
    pattern: "const st = [];\nfor (const c of s) {\n  if ('([{'.includes(c)) st.push(c);\n  else if (st.pop() !== pair[c]) return false;\n}\nreturn st.length === 0;",
    problems: [
      P("valid-parentheses", "Valid Parentheses", "Easy", "isValid", ["s"], [[["()[]{}"], true], [["(]"], false], [["([)]"], false]]),
      P("evaluate-reverse-polish-notation", "Evaluate Reverse Polish Notation", "Medium", "evalRPN", ["tokens"], [[[["2", "1", "+", "3", "*"]], 9], [[["4", "13", "5", "/", "+"]], 6], [[["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]], 22]]),
      P("daily-temperatures", "Daily Temperatures", "Medium", "dailyTemperatures", ["temperatures"], [[[[73, 74, 75, 71, 69, 72, 76, 73]], [1, 1, 4, 2, 1, 1, 0, 0]], [[[30, 40, 50, 60]], [1, 1, 1, 0]], [[[30, 60, 90]], [1, 1, 0]]]),
    ],
  },
  {
    day: 11,
    topic: "Monotonic Stack & Deque",
    ideas: ["Keep the stack increasing or decreasing; pop what can never be the answer again.", "Histogram areas: each bar's width is bounded by the nearest smaller bars.", "A deque of indices gives the max of every window in O(n)."],
    pattern: "const dq = []; // indices, values decreasing\nfor (let i = 0; i < n; i++) {\n  while (dq.length && a[dq.at(-1)] <= a[i]) dq.pop();\n  dq.push(i);\n  if (dq[0] <= i - k) dq.shift();\n  if (i >= k - 1) out.push(a[dq[0]]);\n}",
    problems: [
      P("next-greater-element-i", "Next Greater Element I", "Easy", "nextGreaterElement", ["nums1", "nums2"], [[[[4, 1, 2], [1, 3, 4, 2]], [-1, 3, -1]], [[[2, 4], [1, 2, 3, 4]], [3, -1]], [[[1], [1]], [-1]]]),
      P("largest-rectangle-in-histogram", "Largest Rectangle in Histogram", "Hard", "largestRectangleArea", ["heights"], [[[[2, 1, 5, 6, 2, 3]], 10], [[[2, 4]], 4], [[[1, 1, 1, 1]], 4]]),
      P("sliding-window-maximum", "Sliding Window Maximum", "Hard", "maxSlidingWindow", ["nums", "k"], [[[[1, 3, -1, -3, 5, 3, 6, 7], 3], [3, 3, 5, 5, 6, 7]], [[[1], 1], [1]], [[[9, 8, 7, 6], 2], [9, 8, 7]]]),
    ],
  },
  {
    day: 12,
    topic: "Linked Lists",
    ideas: ["Nodes point to the next node; there's no index access.", "Use a dummy head to simplify edge cases.", "Reverse with three pointers: prev, cur, next."],
    pattern: "let prev = null, cur = head;\nwhile (cur) {\n  const next = cur.next;\n  cur.next = prev;\n  prev = cur;\n  cur = next;\n}\nreturn prev;",
    problems: [
      P("reverse-linked-list", "Reverse Linked List", "Easy", "reverseList", ["head"], [[[[1, 2, 3, 4, 5]], [5, 4, 3, 2, 1]], [[[1, 2]], [2, 1]], [[[]], []]], { argTypes: ["list"], out: "list" }),
      P("merge-two-sorted-lists", "Merge Two Sorted Lists", "Easy", "mergeTwoLists", ["list1", "list2"], [[[[1, 2, 4], [1, 3, 4]], [1, 1, 2, 3, 4, 4]], [[[], []], []], [[[], [0]], [0]]], { argTypes: ["list", "list"], out: "list" }),
      P("middle-of-the-linked-list", "Middle of the Linked List", "Easy", "middleNode", ["head"], [[[[1, 2, 3, 4, 5]], [3, 4, 5]], [[[1, 2, 3, 4, 5, 6]], [4, 5, 6]], [[[1]], [1]]], { argTypes: ["list"], out: "list" }),
    ],
  },
  {
    day: 13,
    topic: "Linked Lists II",
    ideas: ["Gap of n between two pointers finds the nth node from the end.", "Carry digit-by-digit addition through the lists.", "Reverse the second half to check palindromes in O(1) space."],
    pattern: "const dummy = new ListNode(0, head);\nlet fast = dummy, slow = dummy;\nfor (let i = 0; i <= n; i++) fast = fast.next;\nwhile (fast) { fast = fast.next; slow = slow.next; }\nslow.next = slow.next.next;",
    problems: [
      P("remove-nth-node-from-end-of-list", "Remove Nth Node From End of List", "Medium", "removeNthFromEnd", ["head", "n"], [[[[1, 2, 3, 4, 5], 2], [1, 2, 3, 5]], [[[1], 1], []], [[[1, 2], 1], [1]]], { argTypes: ["list", null], out: "list" }),
      P("add-two-numbers", "Add Two Numbers", "Medium", "addTwoNumbers", ["l1", "l2"], [[[[2, 4, 3], [5, 6, 4]], [7, 0, 8]], [[[0], [0]], [0]], [[[9, 9, 9, 9], [9, 9]], [8, 9, 0, 0, 1]]], { argTypes: ["list", "list"], out: "list" }),
      P("palindrome-linked-list", "Palindrome Linked List", "Easy", "isPalindrome", ["head"], [[[[1, 2, 2, 1]], true], [[[1, 2]], false], [[[1]], true]], { argTypes: ["list"] }),
    ],
  },
  {
    day: 14,
    topic: "Recursion",
    ideas: ["Define the base case, then trust the recursive call for smaller input.", "Draw the recursion tree to count calls (often 2^n).", "Memoize repeated subproblems; fast power halves the exponent."],
    pattern: "function pow(x, n) {\n  if (n === 0) return 1;\n  if (n < 0) return 1 / pow(x, -n);\n  const h = pow(x, n >> 1);\n  return n % 2 ? h * h * x : h * h;\n}",
    problems: [
      P("fibonacci-number", "Fibonacci Number", "Easy", "fib", ["n"], [[[2], 1], [[3], 2], [[10], 55]]),
      P("power-of-two", "Power of Two", "Easy", "isPowerOfTwo", ["n"], [[[1], true], [[16], true], [[3], false]]),
      P("powx-n", "Pow(x, n)", "Medium", "myPow", ["x", "n"], [[[2, 10], 1024], [[2.1, 3], 9.261], [[2, -2], 0.25]], { compare: "float" }),
    ],
  },
  {
    day: 15,
    topic: "Backtracking",
    ideas: ["Choose, explore, un-choose.", "Pass a start index to avoid reusing earlier elements.", "Prune branches that can't lead to a solution."],
    pattern: "const out = [], path = [];\nfunction bt(start) {\n  out.push([...path]);\n  for (let i = start; i < nums.length; i++) {\n    path.push(nums[i]); bt(i + 1); path.pop();\n  }\n}\nbt(0);",
    problems: [
      P("subsets", "Subsets", "Medium", "subsets", ["nums"], [[[[1, 2, 3]], [[], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]]], [[[0]], [[], [0]]], [[[5, 9]], [[], [5], [9], [5, 9]]]], { compare: "deepUnordered" }),
      P("permutations", "Permutations", "Medium", "permute", ["nums"], [[[[1, 2, 3]], [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]], [[[0, 1]], [[0, 1], [1, 0]]], [[[1]], [[1]]]], { compare: "unordered" }),
      P("combination-sum", "Combination Sum", "Medium", "combinationSum", ["candidates", "target"], [[[[2, 3, 6, 7], 7], [[2, 2, 3], [7]]], [[[2, 3, 5], 8], [[2, 2, 2, 2], [2, 3, 3], [3, 5]]], [[[2], 1], []]], { compare: "deepUnordered" }),
    ],
  },
  {
    day: 16,
    topic: "Backtracking II",
    ideas: ["Track counts (open/close brackets) to only build valid strings.", "Grid search: mark visited, recurse in 4 directions, unmark.", "Map digits to letters and build combinations position by position."],
    pattern: "function dfs(r, c, i) {\n  if (i === word.length) return true;\n  if (r < 0 || c < 0 || r >= R || c >= C || board[r][c] !== word[i]) return false;\n  const t = board[r][c]; board[r][c] = '#';\n  const ok = dfs(r+1,c,i+1) || dfs(r-1,c,i+1) || dfs(r,c+1,i+1) || dfs(r,c-1,i+1);\n  board[r][c] = t;\n  return ok;\n}",
    problems: [
      P("generate-parentheses", "Generate Parentheses", "Medium", "generateParenthesis", ["n"], [[[3], ["((()))", "(()())", "(())()", "()(())", "()()()"]], [[1], ["()"]], [[2], ["(())", "()()"]]], { compare: "unordered" }),
      P("letter-combinations-of-a-phone-number", "Letter Combinations of a Phone Number", "Medium", "letterCombinations", ["digits"], [[["23"], ["ad", "ae", "af", "bd", "be", "bf", "cd", "ce", "cf"]], [[""], []], [["2"], ["a", "b", "c"]]], { compare: "unordered" }),
      P("word-search", "Word Search", "Medium", "exist", ["board", "word"], [[[[["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "ABCCED"], true], [[[["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "SEE"], true], [[[["A", "B", "C", "E"], ["S", "F", "C", "S"], ["A", "D", "E", "E"]], "ABCB"], false]]),
    ],
  },
  {
    day: 17,
    topic: "Binary Trees",
    ideas: ["Most tree problems: solve for left, solve for right, combine.", "Depth = 1 + max(depth(left), depth(right)).", "Null checks are your base case."],
    pattern: "function depth(node) {\n  if (!node) return 0;\n  return 1 + Math.max(depth(node.left), depth(node.right));\n}",
    problems: [
      P("maximum-depth-of-binary-tree", "Maximum Depth of Binary Tree", "Easy", "maxDepth", ["root"], [[[[3, 9, 20, null, null, 15, 7]], 3], [[[1, null, 2]], 2], [[[]], 0]], { argTypes: ["tree"] }),
      P("invert-binary-tree", "Invert Binary Tree", "Easy", "invertTree", ["root"], [[[[4, 2, 7, 1, 3, 6, 9]], [4, 7, 2, 9, 6, 3, 1]], [[[2, 1, 3]], [2, 3, 1]], [[[]], []]], { argTypes: ["tree"], out: "tree" }),
      P("same-tree", "Same Tree", "Easy", "isSameTree", ["p", "q"], [[[[1, 2, 3], [1, 2, 3]], true], [[[1, 2], [1, null, 2]], false], [[[1, 2, 1], [1, 1, 2]], false]], { argTypes: ["tree", "tree"] }),
    ],
  },
  {
    day: 18,
    topic: "Tree Traversals",
    ideas: ["DFS orders: preorder (root first), inorder (left-root-right), postorder (root last).", "BFS with a queue visits level by level.", "Right-side view = last node of each BFS level."],
    pattern: "const out = [], q = root ? [root] : [];\nwhile (q.length) {\n  const level = [];\n  for (let n = q.length; n > 0; n--) {\n    const node = q.shift();\n    level.push(node.val);\n    node.left && q.push(node.left);\n    node.right && q.push(node.right);\n  }\n  out.push(level);\n}",
    problems: [
      P("binary-tree-level-order-traversal", "Binary Tree Level Order Traversal", "Medium", "levelOrder", ["root"], [[[[3, 9, 20, null, null, 15, 7]], [[3], [9, 20], [15, 7]]], [[[1]], [[1]]], [[[]], []]], { argTypes: ["tree"] }),
      P("binary-tree-inorder-traversal", "Binary Tree Inorder Traversal", "Easy", "inorderTraversal", ["root"], [[[[1, null, 2, 3]], [1, 3, 2]], [[[]], []], [[[1]], [1]]], { argTypes: ["tree"] }),
      P("binary-tree-right-side-view", "Binary Tree Right Side View", "Medium", "rightSideView", ["root"], [[[[1, 2, 3, null, 5, null, 4]], [1, 3, 4]], [[[1, null, 3]], [1, 3]], [[[]], []]], { argTypes: ["tree"] }),
    ],
  },
  {
    day: 19,
    topic: "Trees II",
    ideas: ["Return one value up the recursion, track the global answer on the side.", "Balanced check: return -1 as soon as a subtree is unbalanced.", "Path sums: subtract as you go down, check at leaves."],
    pattern: "let best = 0;\nfunction h(n) {\n  if (!n) return 0;\n  const l = h(n.left), r = h(n.right);\n  best = Math.max(best, l + r);\n  return 1 + Math.max(l, r);\n}",
    problems: [
      P("diameter-of-binary-tree", "Diameter of Binary Tree", "Easy", "diameterOfBinaryTree", ["root"], [[[[1, 2, 3, 4, 5]], 3], [[[1, 2]], 1], [[[1]], 0]], { argTypes: ["tree"] }),
      P("balanced-binary-tree", "Balanced Binary Tree", "Easy", "isBalanced", ["root"], [[[[3, 9, 20, null, null, 15, 7]], true], [[[1, 2, 2, 3, 3, null, null, 4, 4]], false], [[[]], true]], { argTypes: ["tree"] }),
      P("path-sum", "Path Sum", "Easy", "hasPathSum", ["root", "targetSum"], [[[[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1], 22], true], [[[1, 2, 3], 5], false], [[[], 0], false]], { argTypes: ["tree", null] }),
    ],
  },
  {
    day: 20,
    topic: "Binary Search Trees",
    ideas: ["Left subtree < node < right subtree, for every node.", "Inorder traversal of a BST is sorted.", "Use (min, max) bounds to validate; walk down to find the split point for LCA."],
    pattern: "function valid(n, lo = -Infinity, hi = Infinity) {\n  if (!n) return true;\n  if (n.val <= lo || n.val >= hi) return false;\n  return valid(n.left, lo, n.val) && valid(n.right, n.val, hi);\n}",
    problems: [
      P("validate-binary-search-tree", "Validate Binary Search Tree", "Medium", "isValidBST", ["root"], [[[[2, 1, 3]], true], [[[5, 1, 4, null, null, 3, 6]], false], [[[5, 4, 6, null, null, 3, 7]], false]], { argTypes: ["tree"] }),
      P("kth-smallest-element-in-a-bst", "Kth Smallest Element in a BST", "Medium", "kthSmallest", ["root", "k"], [[[[3, 1, 4, null, 2], 1], 1], [[[5, 3, 6, 2, 4, null, null, 1], 3], 3], [[[2, 1, 3], 3], 3]], { argTypes: ["tree", null] }),
      P("lowest-common-ancestor-of-a-binary-search-tree", "Lowest Common Ancestor of a BST", "Medium", "lowestCommonAncestor", ["root", "p", "q"], [[[[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 2, 8], 6], [[[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 2, 4], 2], [[[2, 1], 2, 1], 2]], { argTypes: ["tree", "treeNode", "treeNode"], out: "val" }),
    ],
  },
  {
    day: 21,
    topic: "Heaps & Priority Queues",
    ideas: ["A heap gives the min (or max) in O(1) and insert/remove in O(log n).", "Top-k: keep a heap of size k.", "In JS you write a small heap or sort when n is small; in Java use PriorityQueue."],
    pattern: "// Java: PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) => b[0] - a[0]);\n// JS (small n): stones.sort((a, b) => b - a) each round, or a binary heap class.",
    problems: [
      P("last-stone-weight", "Last Stone Weight", "Easy", "lastStoneWeight", ["stones"], [[[[2, 7, 4, 1, 8, 1]], 1], [[[1]], 1], [[[2, 2]], 0]]),
      P("k-closest-points-to-origin", "K Closest Points to Origin", "Medium", "kClosest", ["points", "k"], [[[[[1, 3], [-2, 2]], 1], [[-2, 2]]], [[[[3, 3], [5, -1], [-2, 4]], 2], [[3, 3], [-2, 4]]], [[[[0, 1], [1, 0]], 2], [[0, 1], [1, 0]]]], { compare: "unordered" }),
      P("top-k-frequent-words", "Top K Frequent Words", "Medium", "topKFrequent", ["words", "k"], [[[["i", "love", "leetcode", "i", "love", "coding"], 2], ["i", "love"]], [[["the", "day", "is", "sunny", "the", "the", "the", "sunny", "is", "is"], 4], ["the", "is", "sunny", "day"]], [[["a", "b", "a"], 1], ["a"]]]),
    ],
  },
  {
    day: 22,
    topic: "Graphs: BFS & DFS",
    ideas: ["Grids are graphs: each cell connects to its 4 neighbours.", "Visit each cell once: mark visited when you push it.", "Count connected components by starting a DFS from every unvisited cell."],
    pattern: "function dfs(r, c) {\n  if (r < 0 || c < 0 || r >= R || c >= C || grid[r][c] !== '1') return;\n  grid[r][c] = '0';\n  dfs(r+1,c); dfs(r-1,c); dfs(r,c+1); dfs(r,c-1);\n}",
    problems: [
      P("number-of-islands", "Number of Islands", "Medium", "numIslands", ["grid"], [[[[["1", "1", "1", "1", "0"], ["1", "1", "0", "1", "0"], ["1", "1", "0", "0", "0"], ["0", "0", "0", "0", "0"]]], 1], [[[["1", "1", "0", "0", "0"], ["1", "1", "0", "0", "0"], ["0", "0", "1", "0", "0"], ["0", "0", "0", "1", "1"]]], 3], [[[["0"]]], 0]]),
      P("flood-fill", "Flood Fill", "Easy", "floodFill", ["image", "sr", "sc", "color"], [[[[[1, 1, 1], [1, 1, 0], [1, 0, 1]], 1, 1, 2], [[2, 2, 2], [2, 2, 0], [2, 0, 1]]], [[[[0, 0, 0], [0, 0, 0]], 0, 0, 0], [[0, 0, 0], [0, 0, 0]]], [[[[0]], 0, 0, 5], [[5]]]]),
      P("max-area-of-island", "Max Area of Island", "Medium", "maxAreaOfIsland", ["grid"], [[[[[0, 0, 1, 0, 0], [0, 1, 1, 0, 0], [0, 0, 0, 1, 1]]], 3], [[[[0, 0, 0, 0]]], 0], [[[[1, 1], [1, 0]]], 3]]),
    ],
  },
  {
    day: 23,
    topic: "Graphs II",
    ideas: ["Multi-source BFS spreads from many starts at once (rotting oranges).", "Cycle detection in a directed graph: DFS colours (unvisited / visiting / done).", "Adjacency lists: Map or array of arrays."],
    pattern: "const graph = Array.from({ length: n }, () => []);\nfor (const [a, b] of edges) graph[b].push(a);\nconst state = new Array(n).fill(0); // 0 new, 1 visiting, 2 done\nfunction hasCycle(u) {\n  if (state[u] === 1) return true;\n  if (state[u] === 2) return false;\n  state[u] = 1;\n  for (const v of graph[u]) if (hasCycle(v)) return true;\n  state[u] = 2;\n  return false;\n}",
    problems: [
      P("rotting-oranges", "Rotting Oranges", "Medium", "orangesRotting", ["grid"], [[[[[2, 1, 1], [1, 1, 0], [0, 1, 1]]], 4], [[[[2, 1, 1], [0, 1, 1], [1, 0, 1]]], -1], [[[[0, 2]]], 0]]),
      P("course-schedule", "Course Schedule", "Medium", "canFinish", ["numCourses", "prerequisites"], [[[2, [[1, 0]]], true], [[2, [[1, 0], [0, 1]]], false], [[3, [[1, 0], [2, 1]]], true]]),
      P("number-of-provinces", "Number of Provinces", "Medium", "findCircleNum", ["isConnected"], [[[[[1, 1, 0], [1, 1, 0], [0, 0, 1]]], 2], [[[[1, 0, 0], [0, 1, 0], [0, 0, 1]]], 3], [[[[1]]], 1]]),
    ],
  },
  {
    day: 24,
    topic: "Topological Sort & Union-Find",
    ideas: ["Kahn's algorithm: repeatedly take nodes with in-degree 0.", "Union-Find merges sets with near-O(1) operations (path compression + union by rank).", "An edge joining two nodes already in the same set forms a cycle."],
    pattern: "const parent = Array.from({ length: n + 1 }, (_, i) => i);\nconst find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));\nconst union = (a, b) => { const ra = find(a), rb = find(b); if (ra === rb) return false; parent[ra] = rb; return true; };",
    problems: [
      P("find-if-path-exists-in-graph", "Find if Path Exists in Graph", "Easy", "validPath", ["n", "edges", "source", "destination"], [[[3, [[0, 1], [1, 2], [2, 0]], 0, 2], true], [[6, [[0, 1], [0, 2], [3, 5], [5, 4], [4, 3]], 0, 5], false], [[1, [], 0, 0], true]]),
      P("redundant-connection", "Redundant Connection", "Medium", "findRedundantConnection", ["edges"], [[[[[1, 2], [1, 3], [2, 3]]], [2, 3]], [[[[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]]], [1, 4]], [[[[1, 2], [2, 3], [1, 3]]], [1, 3]]]),
      P("course-schedule-ii", "Course Schedule II", "Medium", "findOrder", ["numCourses", "prerequisites"], [[[2, [[1, 0]]], [0, 1]], [[4, [[1, 0], [2, 0], [3, 1], [3, 2]]], [0, 1, 2, 3]], [[2, [[1, 0], [0, 1]]], []]], { compare: "topo" }),
    ],
  },
  {
    day: 25,
    topic: "Shortest Paths",
    ideas: ["Unweighted graphs: BFS gives shortest paths.", "Non-negative weights: Dijkstra with a min-heap.", "At most k edges: Bellman-Ford for k+1 rounds."],
    pattern: "const dist = new Array(n + 1).fill(Infinity);\ndist[src] = 0;\n// Dijkstra: pop the closest unvisited node, relax its edges\n// Bellman-Ford with k stops: repeat k+1 times over a copy of dist",
    problems: [
      P("network-delay-time", "Network Delay Time", "Medium", "networkDelayTime", ["times", "n", "k"], [[[[[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2], 2], [[[[1, 2, 1]], 2, 1], 1], [[[[1, 2, 1]], 2, 2], -1]]),
      P("shortest-path-in-binary-matrix", "Shortest Path in Binary Matrix", "Medium", "shortestPathBinaryMatrix", ["grid"], [[[[[0, 1], [1, 0]]], 2], [[[[0, 0, 0], [1, 1, 0], [1, 1, 0]]], 4], [[[[1, 0, 0], [1, 1, 0], [1, 1, 0]]], -1]]),
      P("cheapest-flights-within-k-stops", "Cheapest Flights Within K Stops", "Medium", "findCheapestPrice", ["n", "flights", "src", "dst", "k"], [[[4, [[0, 1, 100], [1, 2, 100], [2, 0, 100], [1, 3, 600], [2, 3, 200]], 0, 3, 1], 700], [[3, [[0, 1, 100], [1, 2, 100], [0, 2, 500]], 0, 2, 1], 200], [[3, [[0, 1, 100], [1, 2, 100], [0, 2, 500]], 0, 2, 0], 500]]),
    ],
  },
  {
    day: 26,
    topic: "Dynamic Programming 1D",
    ideas: ["DP = recursion + memory: define dp[i], the recurrence, and base cases.", "Many 1D DPs only need the last two values.", "Coin change: dp[x] = min over coins of dp[x - c] + 1."],
    pattern: "const dp = new Array(amount + 1).fill(Infinity);\ndp[0] = 0;\nfor (let x = 1; x <= amount; x++)\n  for (const c of coins) if (c <= x) dp[x] = Math.min(dp[x], dp[x - c] + 1);",
    problems: [
      P("climbing-stairs", "Climbing Stairs", "Easy", "climbStairs", ["n"], [[[2], 2], [[3], 3], [[10], 89]]),
      P("house-robber", "House Robber", "Medium", "rob", ["nums"], [[[[1, 2, 3, 1]], 4], [[[2, 7, 9, 3, 1]], 12], [[[2, 1, 1, 2]], 4]]),
      P("coin-change", "Coin Change", "Medium", "coinChange", ["coins", "amount"], [[[[1, 2, 5], 11], 3], [[[2], 3], -1], [[[1], 0], 0]]),
    ],
  },
  {
    day: 27,
    topic: "Dynamic Programming 1D II",
    ideas: ["LIS: dp[i] = longest increasing subsequence ending at i (O(n²)); patience sorting gives O(n log n).", "Word break: dp[i] is true if some dictionary word ends at i after a true dp[j].", "Decode ways: like stairs with validity checks."],
    pattern: "const dp = new Array(s.length + 1).fill(false);\ndp[0] = true;\nfor (let i = 1; i <= s.length; i++)\n  for (let j = 0; j < i; j++)\n    if (dp[j] && dict.has(s.slice(j, i))) { dp[i] = true; break; }",
    problems: [
      P("longest-increasing-subsequence", "Longest Increasing Subsequence", "Medium", "lengthOfLIS", ["nums"], [[[[10, 9, 2, 5, 3, 7, 101, 18]], 4], [[[0, 1, 0, 3, 2, 3]], 4], [[[7, 7, 7, 7]], 1]]),
      P("word-break", "Word Break", "Medium", "wordBreak", ["s", "wordDict"], [[["leetcode", ["leet", "code"]], true], [["applepenapple", ["apple", "pen"]], true], [["catsandog", ["cats", "dog", "sand", "and", "cat"]], false]]),
      P("decode-ways", "Decode Ways", "Medium", "numDecodings", ["s"], [[["12"], 2], [["226"], 3], [["06"], 0]]),
    ],
  },
  {
    day: 28,
    topic: "Dynamic Programming 2D",
    ideas: ["Grid paths: dp[r][c] = dp[r-1][c] + dp[r][c-1].", "Two strings: dp[i][j] compares prefixes s[..i] and t[..j].", "Edit distance: min of insert, delete, replace + 1."],
    pattern: "for (let i = 1; i <= m; i++)\n  for (let j = 1; j <= n; j++)\n    dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);",
    problems: [
      P("unique-paths", "Unique Paths", "Medium", "uniquePaths", ["m", "n"], [[[3, 7], 28], [[3, 2], 3], [[1, 1], 1]]),
      P("longest-common-subsequence", "Longest Common Subsequence", "Medium", "longestCommonSubsequence", ["text1", "text2"], [[["abcde", "ace"], 3], [["abc", "abc"], 3], [["abc", "def"], 0]]),
      P("edit-distance", "Edit Distance", "Medium", "minDistance", ["word1", "word2"], [[["horse", "ros"], 3], [["intention", "execution"], 5], [["", "a"], 1]]),
    ],
  },
  {
    day: 29,
    topic: "Greedy & Intervals",
    ideas: ["Greedy: make the locally best choice when you can prove it never hurts.", "Interval scheduling: sort by end time, keep the earliest finishing.", "Track the farthest reachable index for jump games."],
    pattern: "intervals.sort((a, b) => a[1] - b[1]);\nlet end = -Infinity, removed = 0;\nfor (const [s, e] of intervals) s >= end ? (end = e) : removed++;",
    problems: [
      P("jump-game", "Jump Game", "Medium", "canJump", ["nums"], [[[[2, 3, 1, 1, 4]], true], [[[3, 2, 1, 0, 4]], false], [[[0]], true]]),
      P("non-overlapping-intervals", "Non-overlapping Intervals", "Medium", "eraseOverlapIntervals", ["intervals"], [[[[[1, 2], [2, 3], [3, 4], [1, 3]]], 1], [[[[1, 2], [1, 2], [1, 2]]], 2], [[[[1, 2], [2, 3]]], 0]]),
      P("gas-station", "Gas Station", "Medium", "canCompleteCircuit", ["gas", "cost"], [[[[1, 2, 3, 4, 5], [3, 4, 5, 1, 2]], 3], [[[2, 3, 4], [3, 4, 3]], -1], [[[5, 1, 2, 3, 4], [4, 4, 1, 5, 1]], 4]]),
    ],
  },
  {
    day: 30,
    topic: "Bit Manipulation",
    ideas: ["x ^ x = 0 and x ^ 0 = x: XOR cancels pairs.", "x & (x - 1) clears the lowest set bit.", "bits[i] = bits[i >> 1] + (i & 1)."],
    pattern: "let count = 0;\nwhile (n) { n &= n - 1; count++; }",
    problems: [
      P("single-number", "Single Number", "Easy", "singleNumber", ["nums"], [[[[2, 2, 1]], 1], [[[4, 1, 2, 1, 2]], 4], [[[1]], 1]]),
      P("counting-bits", "Counting Bits", "Easy", "countBits", ["n"], [[[2], [0, 1, 1]], [[5], [0, 1, 1, 2, 1, 2]], [[0], [0]]]),
      P("number-of-1-bits", "Number of 1 Bits", "Easy", "hammingWeight", ["n"], [[[11], 3], [[128], 1], [[2147483645], 30]]),
    ],
  },
];

export const starter = (p: Problem) => `/**\n * ${p.title} (${p.diff})${p.note ? `\n * Note: ${p.note}` : ""}\n * Helpers available: ListNode(val, next), TreeNode(val, left, right).\n */\nfunction ${p.fn}(${p.params.join(", ")}) {\n  \n}\n`;

/** Day of the path for a given date, counting from `start` (yyyy-mm-dd); cycles after the last day. */
export function dayFor(start: string, today = new Date()) {
  const s = new Date(`${start}T00:00:00`);
  const n = Math.floor((today.getTime() - s.getTime()) / 86_400_000);
  return DSA[((n % DSA.length) + DSA.length) % DSA.length];
}

/** One-line task summaries (paraphrased); the full statement and constraints are on LeetCode. */
export const SUMMARY: Record<string, string> = {
  "two-sum": "Return the indices of the two numbers that add up to target (exactly one answer exists; don't reuse an element).",
  "best-time-to-buy-and-sell-stock": "Pick one day to buy and a later day to sell; return the maximum profit, or 0 if no profit is possible.",
  "contains-duplicate": "Return true if any value appears at least twice in the array.",
  "valid-anagram": "Return true if t is a rearrangement of the letters of s.",
  "valid-palindrome": "Ignoring case and non-alphanumeric characters, does s read the same forwards and backwards?",
  "longest-common-prefix": "Return the longest prefix shared by every string in the array (\"\" if none).",
  "group-anagrams": "Group the words that are anagrams of each other (any order).",
  "top-k-frequent-elements": "Return the k most frequent numbers (any order).",
  "longest-consecutive-sequence": "Return the length of the longest run of consecutive integers in the unsorted array, in O(n).",
  "running-sum-of-1d-array": "Return an array where each element is the sum of all elements up to and including that index.",
  "find-pivot-index": "Return the leftmost index where the sum of elements to its left equals the sum to its right, else -1.",
  "subarray-sum-equals-k": "Count the contiguous subarrays whose sum is exactly k.",
  "two-sum-ii-input-array-is-sorted": "In a sorted array, return the 1-indexed positions of the two numbers that add to target, using O(1) extra space.",
  "3sum": "Return all unique triplets whose sum is zero.",
  "container-with-most-water": "Choose two lines that, with the x-axis, hold the most water; return that area.",
  "maximum-average-subarray-i": "Return the maximum average of any contiguous subarray of length k.",
  "longest-substring-without-repeating-characters": "Return the length of the longest substring with no repeated characters.",
  "minimum-size-subarray-sum": "Return the length of the shortest contiguous subarray with sum ≥ target, or 0 if none.",
  "binary-search": "Return the index of target in the sorted array, or -1, in O(log n).",
  "search-insert-position": "Return the index of target, or where it would be inserted to keep the array sorted.",
  "find-minimum-in-rotated-sorted-array": "A sorted array of unique values was rotated; find its minimum in O(log n).",
  "sqrtx": "Return the integer square root of x (rounded down) without using built-in power functions.",
  "koko-eating-bananas": "Find the smallest eating speed (bananas/hour) that finishes all piles within h hours.",
  "capacity-to-ship-packages-within-d-days": "Find the least ship capacity that ships all packages, in order, within the given days.",
  "sort-colors": "Sort an array of 0s, 1s and 2s in place in one pass (no library sort).",
  "merge-intervals": "Merge all overlapping intervals and return the result.",
  "kth-largest-element-in-an-array": "Return the kth largest element (in sorted order, not distinct).",
  "valid-parentheses": "Return true if every bracket is closed by the same type in the correct order.",
  "evaluate-reverse-polish-notation": "Evaluate an expression in Reverse Polish Notation; division truncates toward zero.",
  "daily-temperatures": "For each day, how many days until a warmer temperature? 0 if never.",
  "next-greater-element-i": "For each value of nums1, find the first greater value to its right in nums2, else -1.",
  "largest-rectangle-in-histogram": "Return the area of the largest rectangle that fits in the histogram.",
  "sliding-window-maximum": "Return the maximum of every window of size k as it slides left to right.",
  "reverse-linked-list": "Reverse a singly linked list and return the new head.",
  "merge-two-sorted-lists": "Merge two sorted linked lists into one sorted list.",
  "middle-of-the-linked-list": "Return the middle node (the second middle if there are two).",
  "remove-nth-node-from-end-of-list": "Remove the nth node from the end of the list and return the head.",
  "add-two-numbers": "Two numbers are stored as reversed digit lists; return their sum as a list in the same form.",
  "palindrome-linked-list": "Return true if the list's values read the same forwards and backwards.",
  "fibonacci-number": "Return F(n), where F(0)=0, F(1)=1 and F(n)=F(n-1)+F(n-2).",
  "power-of-two": "Return true if n is a power of two.",
  "powx-n": "Implement x raised to the power n (n may be negative), faster than O(n).",
  subsets: "Return all possible subsets (the power set), without duplicates, in any order.",
  permutations: "Return all orderings of the distinct numbers, in any order.",
  "combination-sum": "Return all unique combinations of candidates (reusable) that sum to target.",
  "generate-parentheses": "Return all well-formed strings of n pairs of parentheses.",
  "letter-combinations-of-a-phone-number": "Return all letter strings the digits 2-9 could represent on a phone keypad.",
  "word-search": "Return true if the word can be traced through adjacent cells of the grid, using each cell at most once.",
  "maximum-depth-of-binary-tree": "Return the number of nodes on the longest root-to-leaf path.",
  "invert-binary-tree": "Mirror the tree (swap every left and right child) and return the root.",
  "same-tree": "Return true if the two trees have the same shape and values.",
  "binary-tree-level-order-traversal": "Return the node values level by level, left to right.",
  "binary-tree-inorder-traversal": "Return the inorder traversal (left, node, right) of the tree.",
  "binary-tree-right-side-view": "Return the values you'd see looking at the tree from the right side, top to bottom.",
  "diameter-of-binary-tree": "Return the number of edges on the longest path between any two nodes.",
  "balanced-binary-tree": "Return true if, at every node, the left and right subtree heights differ by at most 1.",
  "path-sum": "Return true if some root-to-leaf path adds up to targetSum.",
  "validate-binary-search-tree": "Return true if the tree is a valid BST (strictly smaller on the left, larger on the right, everywhere).",
  "kth-smallest-element-in-a-bst": "Return the kth smallest value in the BST (1-indexed).",
  "lowest-common-ancestor-of-a-binary-search-tree": "Return the lowest node in the BST that has both p and q as descendants (a node can descend from itself).",
  "last-stone-weight": "Repeatedly smash the two heaviest stones (the difference survives); return the last weight or 0.",
  "k-closest-points-to-origin": "Return the k points closest to (0, 0), in any order.",
  "top-k-frequent-words": "Return the k most frequent words, sorted by frequency, ties alphabetically.",
  "number-of-islands": "Count the islands: groups of '1' cells connected horizontally or vertically.",
  "flood-fill": "Starting at (sr, sc), recolour the connected region of the same colour to the new colour.",
  "max-area-of-island": "Return the size of the largest island of 1s (0 if none).",
  "rotting-oranges": "Each minute rot spreads to adjacent fresh oranges; return minutes until none are fresh, or -1.",
  "course-schedule": "Given prerequisite pairs [a, b] (take b before a), can you finish every course?",
  "number-of-provinces": "Given an adjacency matrix, count the connected groups of cities.",
  "find-if-path-exists-in-graph": "In the undirected graph, is there a path from source to destination?",
  "redundant-connection": "A tree had one extra edge added; return the edge that, if removed, leaves a tree (the last such edge).",
  "course-schedule-ii": "Return any valid order to take all courses, or [] if impossible.",
  "network-delay-time": "A signal starts at node k; return the time for all n nodes to receive it, or -1.",
  "shortest-path-in-binary-matrix": "Return the length of the shortest 8-directional clear path from top-left to bottom-right, or -1.",
  "cheapest-flights-within-k-stops": "Return the cheapest price from src to dst with at most k stops, or -1.",
  "climbing-stairs": "Taking 1 or 2 steps at a time, how many distinct ways can you climb n stairs?",
  "house-robber": "Return the most money you can take without robbing two adjacent houses.",
  "coin-change": "Return the fewest coins that make up the amount, or -1 if it can't be made.",
  "longest-increasing-subsequence": "Return the length of the longest strictly increasing subsequence.",
  "word-break": "Can s be split into a sequence of dictionary words (reusable)?",
  "decode-ways": "Letters map to 1-26; count the ways to decode the digit string.",
  "unique-paths": "Moving only right or down, how many paths go from the top-left to the bottom-right of an m×n grid?",
  "longest-common-subsequence": "Return the length of the longest subsequence common to both strings.",
  "edit-distance": "Return the minimum inserts, deletes and replacements to turn word1 into word2.",
  "jump-game": "Each value is your max jump length from there; can you reach the last index?",
  "non-overlapping-intervals": "Return the minimum number of intervals to remove so the rest don't overlap.",
  "gas-station": "Return the start station from which you can drive the full circle, or -1.",
  "single-number": "Every number appears twice except one; find it in O(n) time and O(1) space.",
  "counting-bits": "For every i from 0 to n, return the number of 1 bits in i.",
  "number-of-1-bits": "Return the number of 1 bits in the binary form of n.",
};
