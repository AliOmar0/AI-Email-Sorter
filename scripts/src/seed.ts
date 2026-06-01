import {
  db,
  pool,
  emailsTable,
  labelsTable,
  emailLabelsTable,
} from "@workspace/db";

const systemLabels = [
  { name: "Work", color: "#6366f1", description: "Job, projects, and colleagues", isSystem: true },
  { name: "Personal", color: "#ec4899", description: "Friends, family, and personal matters", isSystem: true },
  { name: "Finance", color: "#10b981", description: "Bills, banking, and receipts", isSystem: true },
  { name: "Newsletters", color: "#f59e0b", description: "Subscriptions and digests", isSystem: true },
  { name: "Promotions", color: "#f97316", description: "Marketing and offers", isSystem: true },
  { name: "Travel", color: "#06b6d4", description: "Flights, hotels, and itineraries", isSystem: true },
  { name: "Social", color: "#8b5cf6", description: "Social network notifications", isSystem: true },
  { name: "Updates", color: "#3b82f6", description: "Account and service updates", isSystem: true },
];

function daysAgo(days: number, hours = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d;
}

interface SeedEmail {
  sender: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
}

const emails: SeedEmail[] = [
  {
    sender: "Sarah Chen",
    senderEmail: "sarah.chen@acmecorp.com",
    subject: "Q3 Roadmap review — please add your items",
    snippet: "Hi team, ahead of Thursday's planning session, please drop your priorities into the shared roadmap doc...",
    body: "Hi team,\n\nAhead of Thursday's planning session, please drop your priorities into the shared roadmap doc by EOD Wednesday. I want us to align on the top three initiatives for Q3 so engineering can start scoping.\n\nA few things I'd like us to cover:\n- Status of the mobile redesign\n- The data pipeline migration timeline\n- Hiring plan for the platform team\n\nThanks,\nSarah",
    receivedAt: daysAgo(0, 2),
    isRead: false,
    isStarred: true,
  },
  {
    sender: "GitHub",
    senderEmail: "notifications@github.com",
    subject: "[acme/web-app] Pull request #482 was approved",
    snippet: "alex-dev approved your pull request. Fix: prevent duplicate label inserts on bulk operations...",
    body: "alex-dev approved your pull request #482 'Fix: prevent duplicate label inserts on bulk operations'.\n\nYou can now merge this pull request.\n\nView it on GitHub.",
    receivedAt: daysAgo(0, 5),
    isRead: false,
    isStarred: false,
  },
  {
    sender: "Chase Bank",
    senderEmail: "no-reply@chase.com",
    subject: "Your statement is ready",
    snippet: "Your monthly account statement for account ending in 4821 is now available to view online...",
    body: "Dear customer,\n\nYour monthly account statement for the account ending in 4821 is now available. Your current balance is $3,204.18.\n\nLog in to your account to view the full statement. Please do not reply to this automated message.",
    receivedAt: daysAgo(1),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "Delta Air Lines",
    senderEmail: "confirmations@delta.com",
    subject: "Your trip to San Francisco is confirmed — DL 1284",
    snippet: "Thanks for booking with Delta. Your confirmation number is JX9P2L. Departure: June 14, 8:45 AM...",
    body: "Thanks for booking with Delta!\n\nConfirmation number: JX9P2L\nFlight: DL 1284\nDeparture: June 14, 8:45 AM (JFK)\nArrival: June 14, 12:10 PM (SFO)\nSeat: 14C\n\nCheck in opens 24 hours before departure. Safe travels!",
    receivedAt: daysAgo(1, 3),
    isRead: true,
    isStarred: true,
  },
  {
    sender: "Morning Brew",
    senderEmail: "crew@morningbrew.com",
    subject: "☕ Markets rally as tech earnings beat expectations",
    snippet: "Good morning. Stocks climbed yesterday after several tech giants posted stronger-than-expected results...",
    body: "Good morning.\n\nStocks climbed yesterday after several tech giants posted stronger-than-expected quarterly results. The Nasdaq closed up 1.8%, led by semiconductor names.\n\nIn other news: a new AI startup raised $200M in its Series B, and oil prices dipped on supply concerns.\n\nRead more in today's edition.",
    receivedAt: daysAgo(1, 6),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "Mom",
    senderEmail: "linda.parker@gmail.com",
    subject: "Sunday dinner?",
    snippet: "Hi sweetheart, are you free this Sunday for dinner? Your father is making his famous lasagna...",
    body: "Hi sweetheart,\n\nAre you free this Sunday for dinner? Your father is making his famous lasagna and your sister is coming over with the kids. Would love to see you.\n\nLet me know!\n\nLove,\nMom",
    receivedAt: daysAgo(2),
    isRead: false,
    isStarred: false,
  },
  {
    sender: "Amazon",
    senderEmail: "shipment-tracking@amazon.com",
    subject: "Your package has shipped",
    snippet: "Your order of 'Mechanical Keyboard, Wireless' has shipped and will arrive Tuesday...",
    body: "Hello,\n\nYour order #112-9384756 of 'Mechanical Keyboard, Wireless' has shipped and is expected to arrive on Tuesday, June 3.\n\nTrack your package for the latest updates.\n\nThanks for shopping with us.",
    receivedAt: daysAgo(2, 4),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "Spotify",
    senderEmail: "no-reply@spotify.com",
    subject: "50% off Premium for 3 months — today only",
    snippet: "Upgrade to Premium and get ad-free music, offline listening, and more. Limited time offer...",
    body: "Hey there,\n\nUpgrade to Spotify Premium today and get 50% off for your first 3 months. Enjoy ad-free music, offline listening, and unlimited skips.\n\nThis offer expires at midnight. Don't miss out!",
    receivedAt: daysAgo(3),
    isRead: false,
    isStarred: false,
  },
  {
    sender: "LinkedIn",
    senderEmail: "messages-noreply@linkedin.com",
    subject: "You have 3 new connection requests",
    snippet: "Jordan Lee, Priya Nair, and 1 other want to connect with you on LinkedIn...",
    body: "Hi,\n\nYou have 3 new connection requests waiting:\n- Jordan Lee, Product Manager at Northwind\n- Priya Nair, Staff Engineer at Globex\n- Marcus Webb, Recruiter at TalentForge\n\nView and respond to your invitations.",
    receivedAt: daysAgo(3, 5),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "Stripe",
    senderEmail: "receipts@stripe.com",
    subject: "Receipt for your payment to Figma",
    snippet: "You paid $144.00 to Figma Inc. Receipt #2849-1102. Annual subscription renewal...",
    body: "Receipt #2849-1102\n\nYou paid $144.00 to Figma Inc.\nDescription: Figma Professional — annual subscription renewal\nDate: " + new Date().toDateString() + "\n\nThis receipt is for your records.",
    receivedAt: daysAgo(4),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "Alex Rivera",
    senderEmail: "alex.rivera@acmecorp.com",
    subject: "Re: Deployment is failing on staging",
    snippet: "I think the issue is the missing env var. I pushed a fix — can you re-run the pipeline when you get a sec?",
    body: "Hey,\n\nI dug into it and I think the issue is the missing DATABASE_URL env var on the staging runner. I pushed a fix to the config — can you re-run the pipeline when you get a sec and confirm it's green?\n\nThanks!\nAlex",
    receivedAt: daysAgo(4, 2),
    isRead: false,
    isStarred: false,
  },
  {
    sender: "Airbnb",
    senderEmail: "automated@airbnb.com",
    subject: "Reservation reminder: your stay in Lisbon",
    snippet: "Your trip is coming up! Check-in at the Alfama apartment is June 20, 3:00 PM...",
    body: "Your trip is coming up!\n\nReservation: Cozy apartment in Alfama, Lisbon\nCheck-in: June 20, 3:00 PM\nCheck-out: June 25, 11:00 AM\nHost: Maria\n\nMessage your host if you have any questions about your arrival.",
    receivedAt: daysAgo(5),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "The New York Times",
    senderEmail: "nytdirect@nytimes.com",
    subject: "The Morning: What to know today",
    snippet: "A roundup of the biggest stories: a major climate agreement, election updates, and a cultural shift...",
    body: "Good morning. Here's what you need to know today:\n\n- World leaders reached a major climate agreement at the summit\n- Primary election results are in for three key states\n- A look at how remote work is reshaping cities\n\nRead the full briefing online.",
    receivedAt: daysAgo(5, 4),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "Notion",
    senderEmail: "team@makenotion.com",
    subject: "New: AI-powered databases are here",
    snippet: "We just shipped a big update. Automatically fill properties, summarize pages, and more with Notion AI...",
    body: "Hi there,\n\nWe just shipped a big update to Notion. You can now use AI to automatically fill database properties, summarize long pages, and translate content inline.\n\nUpdate your workspace to try it out.\n\n— The Notion team",
    receivedAt: daysAgo(6),
    isRead: false,
    isStarred: false,
  },
  {
    sender: "Dr. Patel's Office",
    senderEmail: "appointments@westsidehealth.com",
    subject: "Appointment reminder: June 9 at 10:30 AM",
    snippet: "This is a reminder of your upcoming appointment with Dr. Patel. Please arrive 15 minutes early...",
    body: "This is a reminder of your upcoming appointment:\n\nProvider: Dr. Patel\nDate: June 9, 10:30 AM\nLocation: Westside Health, Suite 210\n\nPlease arrive 15 minutes early to complete any paperwork. Reply CONFIRM or call us to reschedule.",
    receivedAt: daysAgo(6, 3),
    isRead: false,
    isStarred: true,
  },
  {
    sender: "Uber Receipts",
    senderEmail: "receipts@uber.com",
    subject: "Your Thursday morning trip with Uber",
    snippet: "Thanks for riding! Your trip total was $18.42. Trip from Home to Downtown Office...",
    body: "Thanks for riding with Uber!\n\nTrip total: $18.42\nFrom: Home\nTo: Downtown Office\nDistance: 4.2 miles\nDriver: Samuel\n\nRate your trip in the app.",
    receivedAt: daysAgo(7),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "Figma",
    senderEmail: "no-reply@figma.com",
    subject: "Priya commented on 'Inbox AI — Designs'",
    snippet: "Priya: 'Love the new sidebar treatment! Can we try a lighter accent on the labels?'...",
    body: "Priya commented on the file 'Inbox AI — Designs':\n\n\"Love the new sidebar treatment! Can we try a lighter accent on the labels? I think it'll help the AI suggestions stand out more.\"\n\nReply in Figma to continue the conversation.",
    receivedAt: daysAgo(7, 5),
    isRead: false,
    isStarred: false,
  },
  {
    sender: "Coursera",
    senderEmail: "no-reply@coursera.org",
    subject: "Continue your course: Machine Learning Specialization",
    snippet: "You're 60% through Week 3. Pick up where you left off and keep your streak going...",
    body: "Hi,\n\nYou're 60% through Week 3 of the Machine Learning Specialization. You're doing great — pick up where you left off to keep your learning streak going.\n\nNext up: Gradient descent in practice.\n\nResume your course.",
    receivedAt: daysAgo(8),
    isRead: true,
    isStarred: false,
  },
  {
    sender: "IRS",
    senderEmail: "no-reply@irs.gov",
    subject: "Important: Your tax return has been processed",
    snippet: "Your federal tax return for the 2025 tax year has been processed. Your refund is being issued...",
    body: "Dear taxpayer,\n\nYour federal tax return for the 2025 tax year has been processed. Your refund of $1,240 is being issued and should arrive in your account within 5–7 business days.\n\nKeep this notice for your records.",
    receivedAt: daysAgo(9),
    isRead: false,
    isStarred: true,
  },
  {
    sender: "Slack",
    senderEmail: "feedback@slack.com",
    subject: "You were mentioned in #engineering",
    snippet: "@you — 'can you take a look at the labeling endpoint when you have a moment? Tests are flaky.'",
    body: "You were mentioned in #engineering by Dana:\n\n\"@you can you take a look at the labeling endpoint when you have a moment? The integration tests are a bit flaky and I think it's a race condition on the join table.\"\n\nReply in Slack.",
    receivedAt: daysAgo(10),
    isRead: false,
    isStarred: false,
  },
];

async function seed() {
  console.log("Clearing existing data...");
  await db.delete(emailLabelsTable);
  await db.delete(emailsTable);
  await db.delete(labelsTable);

  console.log("Inserting system labels...");
  await db.insert(labelsTable).values(systemLabels);

  console.log(`Inserting ${emails.length} emails...`);
  await db.insert(emailsTable).values(emails);

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
