# TD Sofiivka — Project Design Rules

## Product positioning

TD Sofiivka is a comprehensive engineering supplier and contractor.

The website represents:

- Heating
- Water supply
- Water treatment
- Plumbing
- Climate systems
- Complete engineering solutions

Do not position the company as only a heating store.

## UI principles

- Prefer systematic UI improvements over isolated cosmetic fixes.
- Preserve ecommerce usability.
- Product and engineering content should dominate decoration.
- Avoid generic AI/SaaS aesthetics.
- Avoid unnecessary gradients, glows and decorative effects.
- Use visual hierarchy instead of excessive cards and containers.
- Reuse existing components.
- Reuse design tokens.
- Do not introduce arbitrary CSS patches when a systemic solution exists.
- Maintain consistency across Homepage, Catalog, PLP, PDP, Brands, Search, Cart and Comparison.

## Workflow for significant UI changes

Before implementation:

1. Inspect the whole page.
2. Inspect relevant reusable components.
3. Inspect responsive behavior.
4. Identify the underlying visual/UX problem.
5. Select relevant design skills.

After implementation:

1. Open the result in the browser.
2. Check desktop.
3. Check mobile.
4. Run visual QA.
5. Run anti-AI-slop review.
6. Check regressions.
7. Fix discovered issues before declaring the task complete.

## Publishing completed changes

- After relevant checks pass, commit the files changed for the task and push to `origin/master` promptly.
- A push to `origin/master` deploys the production site on Vercel. Verify the production deployment before reporting completion.
- The user has authorized this publishing workflow without an additional confirmation request. Keep unrelated local files out of the commit.
