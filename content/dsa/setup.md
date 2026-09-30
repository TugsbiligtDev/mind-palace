# Take it to your Mac

Everything in this course runs in your browser, so you never *need* to install anything. But real programmers run code on their own computer, and a few lessons (timing big arrays, and the capstone's tests) are best done there.

## Install Node.js

Node.js runs JavaScript outside the browser. On your Apple Silicon Mac, with Homebrew:

```bash
brew install node
node --version
```

You should see a version number such as `v22.x`.

## Run a file

Create a file called `hello.js`:

```js
console.log("Hello from Node");
```

Then run it in Terminal:

```bash
node hello.js
```

## Test your code with `node:test`

Node has a built-in test runner. Save this as `sum.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");

function sum(nums) {
  return nums.reduce((a, b) => a + b, 0);
}

test("sums a list", () => {
  assert.strictEqual(sum([1, 2, 3]), 6);
});

test("an empty list sums to 0", () => {
  assert.strictEqual(sum([]), 0);
});
```

Run it with:

```bash
node --test
```

Each `test(...)` block is one check. `assert.strictEqual(actual, expected)` fails the test if they differ, and `assert.deepStrictEqual` does the same for arrays and objects.

## Timing code

```js
const start = performance.now();
// ...the code you want to time...
console.log(`${(performance.now() - start).toFixed(1)} ms`);
```

Timings differ from run to run, so run each one a few times before you trust it.
