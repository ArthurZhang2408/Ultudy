# Launch Mode Quick Reference

## Current Mode

Check your `.env.local` file:

```bash
cat .env.local | grep LAUNCH_MODE
```

## Switch Modes

### Development Mode (Full App)

```env
NEXT_PUBLIC_LAUNCH_MODE=app
```

### Landing Page Mode (Pre-Launch)

```env
NEXT_PUBLIC_LAUNCH_MODE=landing
```

**Important:** Restart dev server after changing:

```bash
npm run dev
```

## Full Documentation

See [../LAUNCH_MODE_GUIDE.md](../LAUNCH_MODE_GUIDE.md) for complete instructions and launch day checklist.
