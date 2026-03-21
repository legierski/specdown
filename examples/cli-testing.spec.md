# CLI Testing

Specdown can test command-line tools too. Use **Run** and **Output** instead of **Request** and **Response**.

---

## Simple command

**Run** → `echo hello world`

**Output** → `🟢 exit 0`

```
hello world
```

---

## Check Node.js version

**Run** → `node --version`

**Output** → `🟢 exit 0`

---

## JSON output from a CLI tool

**Run** → `echo '{"name":"specdown","version":"0.9.0"}'`

**Output** → `🟢 exit 0`

```json
{
  "name": "any-text",
  "version": "any-text"
}
```

---

## Command that should fail

**Run** → `cat /file/that/does/not/exist`

**Output** → `🔴 exit 1`

---

## Down arrow for blocks

**Run** ↓

```bash
echo "down arrow for blocks"
```

**Output** → `🟢 exit 0`

```
down arrow for blocks
```

---

## No arrow for blocks

**Run**

```bash
echo "no arrow for blocks"
```

**Output** → `🟢 exit 0`

```
no arrow for blocks
```

---

## No arrows at all

**Run**

```bash
echo "no arrows at all"
```

**Output**

```
no arrows at all
```

---

## Variable chaining between steps

**Run** → `echo '{"token":"abc123"}'`

**Output** → `🟢 exit 0`

```json
{
  "token": "xxxxxx"  // save as: $cli_token
}
```

**Run** → `echo $cli_token`

**Output** → `🟢 exit 0`

```
abc123
```
