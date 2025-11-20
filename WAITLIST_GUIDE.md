# Waitlist & Launch Guide

**Last Updated:** 2025-11-18
**Purpose:** Guide for managing pre-launch waitlist and launch day user notifications
**Status:** Current

---

## Overview

The waitlist system uses Clerk authentication to automatically collect users before launch. Users sign up normally, but instead of accessing the app, they see a countdown timer and waitlist confirmation page.

### Key Benefits

- ✅ No separate database needed - uses existing Clerk authentication
- ✅ Users already have accounts ready for launch day
- ✅ Simple toggle to launch - just change environment variable
- ✅ Built-in email collection via Clerk
- ✅ Professional countdown timer creates anticipation

---

## How It Works

### Pre-Launch Flow

1. **Non-authenticated user visits site**
   - Sees regular landing page with "Get Started" button
   - Looks exactly like the post-launch experience

2. **User clicks "Get Started"**
   - Redirected to Clerk sign-up
   - Creates account (joins waitlist automatically)

3. **After signing up/signing in**
   - Sees waitlist confirmation page
   - Large countdown timer to launch date
   - "You're on the waitlist!" message
   - Preview of features they'll get access to

4. **On launch day**
   - Change `NEXT_PUBLIC_LAUNCH_MODE` from `landing` to `app`
   - All users now see full app when they sign in
   - Send launch announcement email to all users

---

## Configuration

### Environment Variables

Set these in your deployment platform (Vercel, AWS, etc.):

```env
# Pre-launch mode
NEXT_PUBLIC_LAUNCH_MODE=landing

# Set your actual launch date (ISO 8601 format)
NEXT_PUBLIC_LAUNCH_DATE=2025-12-31T00:00:00
```

### Setting Launch Date

The countdown timer uses `NEXT_PUBLIC_LAUNCH_DATE`. Format: `YYYY-MM-DDTHH:MM:SS`

**Examples:**
- December 31, 2025 at midnight: `2025-12-31T00:00:00`
- January 15, 2026 at 3pm: `2026-01-15T15:00:00`
- February 1, 2026 at 9am: `2026-02-01T09:00:00`

**To change the launch date:**
1. Update environment variable in your deployment platform
2. Redeploy (or push a commit to trigger auto-deploy)
3. Countdown timer updates automatically

---

## Launch Day Checklist

### 1. Prepare for Launch (Day Before)

- [ ] Test app in staging environment with `NEXT_PUBLIC_LAUNCH_MODE=app`
- [ ] Verify all features are working
- [ ] Prepare launch announcement email (see templates below)
- [ ] Export user emails from Clerk (see instructions below)
- [ ] Set up email sending method (Mailchimp, SendGrid, etc.)

### 2. Launch! (Launch Day)

- [ ] Change production environment variable: `NEXT_PUBLIC_LAUNCH_MODE=app`
- [ ] Redeploy or trigger auto-deploy
- [ ] Wait for deployment to complete (~2-5 minutes)
- [ ] Test the live site:
  - [ ] Sign in as a test user
  - [ ] Verify you see the full app (not waitlist page)
  - [ ] Test core features
- [ ] Send launch announcement email to all waitlist users

### 3. Post-Launch (First Hour)

- [ ] Monitor error logs for issues
- [ ] Watch for user sign-ins
- [ ] Respond to user feedback
- [ ] Celebrate! 🎉

---

## Exporting User Emails from Clerk

### Method 1: Clerk Dashboard (Easiest)

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Select your application
3. Navigate to **Users** in the sidebar
4. Click **Export** button (top right)
5. Select "CSV" format
6. Download the file
7. Open in spreadsheet software
8. Extract the `email_address` column

### Method 2: Clerk API (Programmatic)

If you need to automate this or have many users:

```javascript
// scripts/export-waitlist-emails.js
const { Clerk } = require('@clerk/backend');

const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });

async function exportEmails() {
  const users = await clerk.users.getUserList();
  const emails = users.map(user => user.emailAddresses[0].emailAddress);

  console.log(emails.join('\n'));
  // Or write to file:
  // fs.writeFileSync('waitlist-emails.txt', emails.join('\n'));
}

exportEmails();
```

Run:
```bash
node scripts/export-waitlist-emails.js > waitlist-emails.txt
```

### Method 3: Clerk Webhooks (Advanced)

Set up a webhook to track signups in real-time:

1. Create a webhook endpoint in your backend
2. Subscribe to `user.created` event
3. Store emails in your own database or send to email service
4. [Clerk Webhooks Documentation](https://clerk.com/docs/integrations/webhooks)

---

## Launch Announcement Email Templates

### Template 1: Simple & Direct

**Subject:** Ultudy is now live! 🚀

**Body:**
```
Hi there,

Thanks for joining the Ultudy waitlist! We're excited to announce that Ultudy is now officially live.

You can now:
✅ Upload your course materials (textbooks, lectures, notes)
✅ Get AI-generated personalized lessons
✅ Track your learning progress and mastery

Get started now: https://ultudy.com

Your account is already set up and ready to go. Just sign in and start learning!

Questions? Reply to this email - we'd love to hear from you.

Happy studying!
The Ultudy Team
```

### Template 2: Feature Highlight

**Subject:** Your AI study companion is ready 🎓

**Body:**
```
Hi [Name],

The wait is over! Ultudy is now live and your account is ready.

Here's what you can do right now:

📚 Upload Your Materials
   Drag and drop your textbooks, lecture notes, and course materials.

🤖 Get AI Lessons
   Our AI reads your materials and creates personalized, adaptive lessons.

📊 Track Your Progress
   See exactly what you've mastered and where to focus next.

👉 Start learning: https://ultudy.com

Your account: [email]
Need help? Just reply to this email.

Let's ace those exams!
The Ultudy Team
```

### Template 3: Motivational

**Subject:** Ready to transform how you study? ✨

**Body:**
```
Hi [Name],

You joined our waitlist because you wanted a better way to study. Today, that becomes reality.

Ultudy is live. Here's what makes it different:

→ No more overwhelm: Upload everything at once, we'll organize it
→ No more guessing: AI identifies your weak spots automatically
→ No more wasted time: Focus only on what you don't know

Click here to start: https://ultudy.com

Your courses are waiting. Let's build something amazing together.

The Ultudy Team

P.S. Exam season coming up? This is your secret weapon. Get started now.
```

---

## Sending Launch Emails

### Option 1: Mailchimp (Recommended for Beginners)

1. Sign up for free Mailchimp account
2. Create a new audience/list
3. Import waitlist emails from Clerk
4. Create email campaign with template above
5. Schedule or send immediately

**Cost:** Free for up to 500 contacts

### Option 2: SendGrid

1. Sign up for SendGrid (free tier: 100 emails/day)
2. Verify your sender email
3. Create a new campaign or use API
4. Import contacts and send

**Cost:** Free for 100 emails/day, paid plans for more

### Option 3: Resend (Developer-Friendly)

1. Sign up at [resend.com](https://resend.com)
2. Get API key
3. Use their API to send emails programmatically
4. Great deliverability and simple API

**Cost:** Free for 3,000 emails/month

### Option 4: Manual (Small Waitlist)

If you have < 50 users:
1. Export emails from Clerk
2. Use your personal email (Gmail, Outlook)
3. BCC all users
4. Send announcement

⚠️ **Warning:** Don't use CC (exposes all emails). Use BCC only.

---

## Tracking Waitlist Growth

### See Total Waitlist Users

**Clerk Dashboard:**
1. Go to Users tab
2. Total count is shown at the top

**Programmatically:**
```javascript
const users = await clerk.users.getUserList();
console.log(`Total waitlist users: ${users.length}`);
```

### Track Signups Over Time

Clerk provides analytics:
1. Go to Dashboard → Analytics
2. View user signups by day/week/month

Or track in your own analytics (Google Analytics, Plausible, etc.)

---

## Customizing the Waitlist Page

### Change Countdown Timer Style

The countdown timer is in `frontend/src/app/page.tsx`:

```typescript
// Current: Large grid with 4 boxes
<div className="grid grid-cols-4 gap-4 max-w-2xl mx-auto">
  {/* ... */}
</div>

// Make it bigger:
<div className="grid grid-cols-4 gap-6 max-w-3xl mx-auto">
  <div className="text-6xl md:text-7xl ...">
    {/* ... */}
  </div>
</div>
```

### Change Messaging

Edit the `PreLaunchPage` component:

```typescript
// Change "You're on the waitlist!" badge
<div className="...">
  You're on the waitlist! // Change this text
</div>

// Change main description
<p className="...">
  Thanks for joining the waitlist! // Change this
</p>
```

### Add Your Own Branding

Replace the gradient colors:
```typescript
// From:
className="bg-gradient-to-r from-primary-600 to-primary-800 ..."

// To your brand colors:
className="bg-gradient-to-r from-blue-600 to-purple-800 ..."
```

---

## Troubleshooting

### Issue: Countdown shows negative numbers

**Cause:** Launch date has passed

**Solution:** Update `NEXT_PUBLIC_LAUNCH_DATE` to a future date or switch to app mode

### Issue: Users see app instead of waitlist

**Cause:** `NEXT_PUBLIC_LAUNCH_MODE` is set to `app`

**Solution:**
1. Verify environment variable is `landing` in production
2. Redeploy after changing
3. Clear browser cache

### Issue: Countdown timer shows wrong time

**Cause:** Timezone mismatch or incorrect date format

**Solution:**
- Use ISO 8601 format: `2025-12-31T00:00:00`
- The countdown calculates based on user's local time
- If you want a specific timezone, use: `2025-12-31T00:00:00-05:00` (EST)

### Issue: Can't export emails from Clerk

**Solutions:**
1. Check you have admin access to Clerk dashboard
2. Try Method 2 (API) instead
3. Contact Clerk support if issue persists

---

## Best Practices

### Email Best Practices

1. **Subject Line:** Keep it under 50 characters
2. **Timing:** Send Tuesday-Thursday, 10am-2pm in user's timezone
3. **Personalization:** Use `[Name]` if possible
4. **Clear CTA:** Single, obvious "Get Started" link
5. **Mobile-friendly:** Most users check email on mobile

### Waitlist Growth Tips

1. **Share on social media** during pre-launch
2. **Add to your email signature**
3. **Post in relevant communities** (Reddit, Discord, etc.)
4. **Ask waitlist users to refer friends** (optional referral system)

### Launch Timing

**Best days to launch:**
- Tuesday, Wednesday, Thursday (highest engagement)

**Avoid:**
- Mondays (people catching up)
- Fridays (weekend plans)
- Holidays and holiday weekends

**Best times:**
- 10am-2pm local time
- When your target users are most active

---

## Analytics & Metrics

### Key Metrics to Track

**Pre-Launch:**
- Waitlist signups per day
- Waitlist conversion rate (visitors → signups)
- Time on waitlist page

**Launch Day:**
- Email open rate (aim for 20-40%)
- Email click rate (aim for 5-15%)
- Launch day logins (% of waitlist who return)

**Post-Launch:**
- Activation rate (% who upload materials)
- Retention (% who return day 2, day 7)

### Setting Up Analytics

Add to `frontend/src/app/page.tsx`:

```typescript
// Track waitlist signup
useEffect(() => {
  if (isSignedIn && isLandingMode) {
    // User just joined waitlist
    analytics.track('Joined Waitlist');
  }
}, [isSignedIn, isLandingMode]);
```

---

## Related Documentation

- [LAUNCH_MODE_GUIDE.md](./LAUNCH_MODE_GUIDE.md) - Technical implementation of launch mode
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - How to deploy to production
- [Clerk Documentation](https://clerk.com/docs) - User management

---

## Quick Reference

### Pre-Launch Environment Variables

```env
NEXT_PUBLIC_LAUNCH_MODE=landing
NEXT_PUBLIC_LAUNCH_DATE=2025-12-31T00:00:00
```

### Launch Day Environment Variables

```env
NEXT_PUBLIC_LAUNCH_MODE=app
NEXT_PUBLIC_LAUNCH_DATE=2025-12-31T00:00:00  # Keep for reference
```

### User Journey

```
Not signed in → Landing page → Click "Get Started" → Clerk sign-up
                                                           ↓
Signed in + landing mode → Waitlist page with countdown
                                                           ↓
Launch day (app mode) → Full application access
```

---

**Need help?** Check the troubleshooting section or review the related documentation above.
