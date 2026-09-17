# [2026-09-17] history | Documentation changes

- Clarified managed Skill ownership conflicts with bilingual CLI recovery
  guidance and README inspection steps. Manual migration preserves the complete
  conflicting directory in a unique backup outside Skill discovery roots, then
  retries setup; existing ownership protection and installation behavior remain
  unchanged.
- Added view-local node dragging and layout reset for relationship and flow
  diagrams, with connected routes, measured-text reflow, and full PNG bounds.
- Limited text hit areas to inline content, preserving native copying while
  allowing card whitespace to drag without a forced text cursor.
- Added a shared bilingual Viewer legend with relationship examples, explicit
  containment and consumer direction, concept boundary styles, and flow shapes
  and branches. The guide remains keyboard-accessible and scrollable on narrow
  screens in both Web sessions and offline exports.

- Added i18next catalogs for English and Simplified Chinese: the CLI follows
  system locale variables and the shared offline/Web Viewer follows browser
  language preferences through the i18next browser detector.
- Reserved the product-specific language override for debugging and testing.
- Defined locale precedence, English fallback, stable machine-readable values,
  and the independently maintained translation extension point.

- Added bilingual English/Chinese GitHub Issue forms for bug reports and
  improvement proposals, and a concise bilingual pull request template covering
  outcomes, related issues, validation, and applicable impact or maintenance
  follow-up. Issue forms apply the existing `bug` and `enhancement` labels.
- Added shared Oxlint and Oxfmt development commands and required their read-only
  checks in release-candidate verification, with code-only formatting scope.

- Prepared `semantic-atlas@2.4.0` with complete-diagram image export.
- Added complete-diagram PNG export to the shared Web and offline Viewer,
  preserving translated text and full layout independently of the camera.
- Documented browser-local snapshot ownership, cleanup, and image-size limits.
