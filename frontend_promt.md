I want you to redesign my CURRENT website UI to closely match the visual language and layout of the attached NexStudio reference website.

IMPORTANT:
- Do NOT create a completely new project.
- Do NOT replace my existing application architecture.
- Do NOT remove existing functionality, routes, APIs, forms, authentication, components, data fetching, or business logic.
- First inspect my existing source code and understand the current component structure.
- Then modify the existing components/styles to achieve the new visual design.
- The attached NexStudio source code is a REFERENCE for the visual design. Do not blindly copy its content or hardcode its demo data.
- Keep my existing website's actual content, project names, features, links, and functionality unless I explicitly ask you to change them.
- The final result should feel like MY website redesigned in the NexStudio style.

REFERENCE DESIGN:
The target visual style is the NexStudio website shown in the attached screenshot/source.

Core design characteristics:
1. Extremely clean minimalist agency aesthetic.
2. White background throughout most of the page.
3. Black typography and black primary buttons.
4. Very large editorial-style typography.
5. Large amounts of whitespace.
6. Thin borders and subtle gray secondary text.
7. Rounded/pill-shaped buttons.
8. Centered hero section.
9. Minimal navigation.
10. Strong visual hierarchy.
11. Subtle hover animations.
12. Smooth scroll/reveal animations.
13. High-quality project imagery.
14. Client/logo marquee sections.
15. Modern premium digital-agency appearance.
16. No unnecessary gradients, glassmorphism, excessive shadows, or colorful UI elements.
17. Avoid making the site look like a generic SaaS dashboard.

==================================================
1. FIRST: ANALYZE MY EXISTING PROJECT
==================================================

Before editing anything:

- Identify the framework being used.
- Identify the entry point.
- Identify the routing structure.
- Identify reusable components.
- Identify the current navbar/header.
- Identify the current hero section.
- Identify project/portfolio sections.
- Identify services sections.
- Identify about section.
- Identify testimonials/social-proof sections.
- Identify contact/CTA sections.
- Identify footer.
- Identify existing animation libraries.
- Identify the styling system:
  - Tailwind
  - CSS modules
  - regular CSS
  - styled-components
  - etc.
- Identify existing assets and image locations.

Do not unnecessarily introduce a new framework or styling library.

If Tailwind is already installed, continue using Tailwind.

If Framer Motion is already installed, use it for animations rather than introducing another animation library.

==================================================
2. GLOBAL DESIGN SYSTEM
==================================================

Transform the entire visual system toward:

Background:
- Primary background: #FFFFFF
- Secondary background sections can use #F7F7F7 or extremely light gray.
- Avoid strong colored backgrounds unless my existing content requires them.

Text:
- Primary: #000000
- Secondary: #3F3F46 / neutral gray
- Muted: #71717A

Borders:
- Very subtle #E5E5E5 / #EAEAEA
- 1px borders where appropriate.

Typography:
Use a modern sans-serif similar to Inter.
If the project already has Inter available, use it.

The typography should feel editorial and premium.

Use:
- Large hero headings
- Tight letter spacing
- Relatively low font weight
- Large line-height contrast
- Italic emphasis on selected words

Example visual hierarchy:

Hero:
font-size:
desktop ~72–96px
tablet ~56–72px
mobile ~42–52px

Hero line-height:
~0.95–1.05

Body:
~17–20px

Navigation:
~14–16px

Buttons:
~13–15px

Do not make every heading bold.

Use font-weight 400 for major editorial headings where appropriate.

Use negative letter-spacing on large headings.

==================================================
3. NAVBAR
==================================================

Redesign the current navbar to resemble the reference.

Desktop layout:

LEFT:
- Existing brand/logo
- Keep my actual brand identity/logo.
- If I do not have a suitable logo, create a simple geometric text-based treatment rather than copying NexStudio's logo.

CENTER:
Navigation links such as:

PROJECTS
ABOUT
SERVICES
BLOG

Use uppercase or visually compact navigation styling depending on the existing content.

RIGHT:
A black pill-shaped CTA:

GET STARTED

Button:
- black background
- white text
- fully rounded
- generous horizontal padding
- subtle hover transition
- slight dark-gray hover state

Navbar:
- white background
- no heavy shadow
- generous horizontal spacing
- max-width container
- vertically centered
- plenty of whitespace

Desktop container should resemble:

max-width: 1280px
margin: auto
padding: 24px

Mobile:
- Keep logo left
- Menu button right
- Open navigation as a clean full-width/dropdown panel
- Maintain the minimalist design
- Do not create a bulky hamburger UI

Navbar should remain responsive.

==================================================
4. HERO SECTION
==================================================

This is the most important redesign.

Create a large centered hero with significant whitespace.

Structure:

[small optional eyebrow]

MAIN HEADLINE

Short supporting paragraph

[PRIMARY CTA] [SECONDARY CTA]

The headline should use the same visual concept as the reference:

Normal text + italic emphasized phrase + normal text.

Example structure:

"WE BUILD"
"Digital Products"
"THAT DRIVE GROWTH."

But DO NOT copy this exact wording if it conflicts with my website.

Instead use my actual website's message.

Use an italic span for the important phrase.

Example:

<h1>
  We Build
  <span className="italic">Digital Experiences</span>
  That Matter.
</h1>

The heading should:
- be centered
- be very large
- have tight tracking
- use a thin/regular weight
- occupy multiple lines
- have strong visual presence

Desktop:
max-width around 850–1000px

Mobile:
max-width around 90%
font-size around 44–52px

Supporting text:
- centered
- max-width ~600px
- gray/dark-blue-gray
- 17–20px
- comfortable line-height

CTA row:
Primary:
BLACK pill button

Secondary:
WHITE pill button
BLACK 1px border

Example:

[ EXPLORE PROJECTS ↗ ] [ CONTACT US ]

Primary button:
- black
- white
- rounded-full
- padding 16px 28px

Secondary:
- white
- black border
- rounded-full

Add subtle hover animation:
- background transition
- arrow moves slightly to the right
- button translates 1–2px if appropriate

Do not overanimate.

==================================================
5. HERO SPACING
==================================================

The reference relies heavily on whitespace.

Do not compress the hero.

Desktop:
- Navbar top padding ~24–32px
- Hero top spacing ~130–180px
- Large gap between heading and paragraph
- Large gap between paragraph and CTA
- Bottom spacing before next section

The page should feel spacious rather than crowded.

==================================================
6. CLIENT / LOGO MARQUEE
==================================================

After the hero, create a client/social-proof logo strip if my current site has client/partner/project logos.

Visual treatment:
- horizontal row
- monochrome logos
- grayscale/black
- lots of spacing
- subtle continuous horizontal movement if appropriate

Use my existing logos/assets.

DO NOT copy the fake NexStudio client names/logos from the reference.

If I do not have client logos, create an appropriate alternative using my existing content rather than inventing companies.

Possible alternative:

"Trusted technologies"
or
"Built with"

with technology logos/icons already present in my project.

==================================================
7. SECTION HEADINGS
==================================================

All major sections should follow the same editorial style.

Instead of:

SERVICES
Our Services
Lorem ipsum...

Use:

SERVICES

How We
Build Digital
Products.

or equivalent wording using my actual content.

Use:
- oversized heading
- regular weight
- italic emphasis
- short supporting description
- generous whitespace

Example:

<section>
  <div>
    <span>SERVICES</span>

    <h2>
      We turn ideas into
      <em>digital products.</em>
    </h2>

    <p>...</p>
  </div>
</section>

==================================================
8. SERVICES SECTION
==================================================

Redesign services into a premium minimalist layout.

Avoid colorful cards.

Use:
- white background
- thin borders
- large service numbers
- large service names
- concise descriptions
- arrow/action indicators

Example:

01
WEB DEVELOPMENT                         →

02
MOBILE APPLICATIONS                     →

03
UI/UX DESIGN                            →

04
AI & AUTOMATION                         →

Each item can have:
- border-top
- generous vertical padding
- hover state
- slight text movement
- arrow movement

On hover:
- service title shifts slightly
- arrow moves right
- border/color subtly changes

Avoid giant shadows.

==================================================
9. PROJECT / PORTFOLIO SECTION
==================================================

Make the portfolio visually dominant.

Use large project images.

Recommended layout:

PROJECTS

Selected Work

[ LARGE PROJECT IMAGE ]
Project Name
Category / Year
Description
VIEW PROJECT →

[ LARGE PROJECT IMAGE ]
Project Name
Category / Year

Use asymmetric or alternating layouts where appropriate.

Do not put every project into small generic cards.

The reference design emphasizes large imagery and whitespace.

Project cards should have:
- rounded corners around 16–24px
- overflow hidden
- image zoom on hover
- clean metadata below image

Image hover:
scale approximately 1.03–1.05
transition ~400–600ms

Do not make the zoom excessive.

==================================================
10. ABOUT SECTION
==================================================

Redesign the About section to feel editorial.

Possible layout:

LEFT:
ABOUT US

RIGHT:
Large statement describing the company.

Use large typography and a simple supporting paragraph.

Example structure:

ABOUT

We combine
strategy, design
and technology to
build products people
actually use.

Use italic emphasis for selected words.

==================================================
11. STATS / TRUST SECTION
==================================================

If my existing site has statistics, display them minimally.

Example:

50+
Projects

20+
Clients

5+
Years Experience

etc.

Do NOT invent numbers.

Only use existing factual numbers from my project.

Design:
- large number
- small uppercase label
- thin borders
- lots of whitespace

==================================================
12. TESTIMONIALS
==================================================

If testimonials already exist, redesign them using a minimal editorial style.

Avoid colorful testimonial cards.

Use:

"Large testimonial quote..."

Client Name
Role / Company

Use large typography.

Can use a simple horizontal slider if the project already has a carousel.

==================================================
13. BLOG SECTION
==================================================

If my website has a blog:

Use large editorial blog cards.

Structure:

BLOG

Latest Insights

[IMAGE]
CATEGORY
Article title
DATE

Use:
- large image
- minimal metadata
- no excessive card styling

Hover:
- image scale
- title underline/subtle movement

==================================================
14. FINAL CTA
==================================================

Create a large final CTA before the footer.

White or black depending on what best fits the existing site.

Preferred reference-inspired structure:

LET'S BUILD SOMETHING

Large headline:
Have an idea?
Let's make it real.

[ START A PROJECT → ]

If using black background:
- white text
- white/outlined secondary elements
- minimal styling

Keep it visually powerful but simple.

==================================================
15. FOOTER
==================================================

Minimal footer.

Include existing:
- logo
- navigation
- social links
- email/contact
- copyright

Avoid a huge complicated footer.

Use:
- thin top border
- generous padding
- clean typography

==================================================
16. ANIMATIONS
==================================================

Add subtle premium animations.

Use existing animation library if available.

Hero:
- fade + translate up
- stagger heading, paragraph, buttons

Sections:
- fade/translate on scroll

Images:
- subtle scale on hover

Buttons:
- arrow moves 3–5px
- subtle background transition

Navigation:
- underline or opacity hover

Do NOT:
- use excessive bouncing
- use flashy 3D animations
- use huge parallax everywhere
- use loading animations that slow the site
- animate every element

Animations should feel like a modern design studio website.

==================================================
17. RESPONSIVENESS
==================================================

The redesign MUST be responsive.

Desktop:
- optimized for 1280–1440px+
- large typography
- horizontal layouts

Tablet:
- reduce heading size
- preserve whitespace
- stack complex layouts when necessary

Mobile:
- 375px
- 390px
- 414px
- 430px widths

Ensure:
- no horizontal overflow
- buttons fit
- headings don't overflow
- images maintain aspect ratio
- navigation works
- project layouts become single-column
- spacing is reduced appropriately

==================================================
18. ACCESSIBILITY
==================================================

Maintain:
- semantic HTML
- proper heading hierarchy
- alt text for images
- keyboard-accessible buttons/links
- visible focus states
- sufficient text contrast
- accessible mobile navigation

Do not sacrifice accessibility for visual similarity.

==================================================
19. PERFORMANCE
==================================================

Do not unnecessarily increase bundle size.

Reuse existing dependencies.

Optimize images where appropriate.

Lazy-load images below the fold.

Avoid unnecessary re-renders.

Do not introduce large libraries just for minor animations.

==================================================
20. IMPORTANT: CONTENT PRESERVATION
==================================================

This is a REDESIGN, not a content replacement.

Keep:
- existing routes
- existing page functionality
- existing API integrations
- existing forms
- existing backend communication
- existing authentication
- existing project data
- existing images where appropriate
- existing links
- existing business logic

Only change:
- layout
- typography
- colors
- spacing
- visual hierarchy
- component styling
- responsive behavior
- animations
- presentation

If my existing content structure differs from the reference, adapt the reference design language to my content rather than forcing my content into the exact NexStudio structure.

==================================================
21. DESIGN DETAILS TO MATCH
==================================================

Pay particular attention to these characteristics from the reference:

- Pure/minimal white background
- Black text
- Large thin typography
- Italic words inside large headings
- Tight letter spacing
- Huge whitespace
- Centered hero
- Pill buttons
- Black primary CTA
- White outlined secondary CTA
- Minimal navbar
- Large project imagery
- Thin borders
- Rounded image containers
- Monochrome visual language
- Editorial agency aesthetic
- Subtle hover states
- Subtle scroll reveal animations
- Clean responsive mobile navigation

The final site should feel like a high-end digital product studio rather than a generic template.

==================================================
22. IMPLEMENTATION PROCESS
==================================================

Follow this sequence:

STEP 1:
Inspect the existing project.

STEP 2:
Identify the current pages/components.

STEP 3:
Create a visual design system:
- colors
- typography
- spacing
- border radius
- buttons
- containers
- animation conventions

STEP 4:
Redesign the global layout/navbar.

STEP 5:
Redesign the homepage hero.

STEP 6:
Redesign project/portfolio section.

STEP 7:
Redesign services.

STEP 8:
Redesign about/trust/testimonials/blog sections that already exist.

STEP 9:
Redesign final CTA.

STEP 10:
Redesign footer.

STEP 11:
Make everything responsive.

STEP 12:
Run/build the project.

STEP 13:
Check for:
- console errors
- broken routes
- broken images
- layout overflow
- mobile issues
- missing imports
- incorrect links
- animation errors

STEP 14:
Fix all issues.

==================================================
23. VISUAL QUALITY CHECK
==================================================

Before finishing, compare the implementation against the attached reference.

Ask:

Does the page have the same minimalist visual character?

Is there enough whitespace?

Are the headings large enough?

Are headings too bold?

Are buttons pill-shaped?

Is the black/white contrast strong?

Does the navbar feel clean?

Do the project images feel large and premium?

Are sections too crowded?

Are there unnecessary shadows/colors/cards?

Does mobile still look intentional?

If something looks like a generic Tailwind template rather than a premium digital agency website, refine it.

IMPORTANT:
Do not simply copy the reference site's HTML or compiled JavaScript.
Recreate the DESIGN SYSTEM and visual language using my existing application's architecture and content.

The final result should look like:

"MY CURRENT WEBSITE + NEXSTUDIO'S VISUAL DESIGN LANGUAGE"

not:

"a copy of the NexStudio demo." and [nexstudio.demos.tailgrids.com.zip](file;file:///c%3A/Users/Ashley/OneDrive/Documents/Crowdfunding/kick-start-crypto/nexstudio.demos.tailgrids.com.zip) 