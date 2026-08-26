---
version: alpha
name: LearnBox
description: Persian-first calm German-learning interface with warm surfaces, precise RTL hierarchy, and encouraging interaction.
colors:
  primary: "#4D6BFE"
  primaryAction: "#4259D6"
  canvas: "#FFFAF4"
  surface: "#FFFFFF"
  ink: "#1E293B"
  muted: "#64748B"
  lavender: "#F3ECFF"
  apricot: "#FFB36B"
  border: "#E7E3FF"
  danger: "#B3261E"
typography:
  display:
    fontFamily: "IRANSansX LearnBox"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.35
  heading:
    fontFamily: "IRANSansX LearnBox"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.45
  body:
    fontFamily: "IRANSansX LearnBox"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.9
  label:
    fontFamily: "IRANSansX LearnBox"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.6
rounded:
  sm: 12px
  md: 18px
  lg: 20px
  xl: 28px
spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primaryAction}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: 56px
    padding: "16px 20px"
  card-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: 56px
    padding: "16px"
  input-focus:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: 56px
    padding: "16px"
  canvas-surface:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "24px"
  text-muted:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "8px"
  status-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "8px"
  accent-lavender:
    backgroundColor: "{colors.lavender}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px"
  accent-apricot:
    backgroundColor: "{colors.apricot}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px"
  border-subtle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.border}"
    rounded: "{rounded.sm}"
    padding: "1px"
---

## Overview

LearnBox is a Persian-first learning product for German vocabulary. Its interface should feel calm, warm, supportive, and trustworthy. The visual system favors strong typographic hierarchy and purposeful illustration over decorative density.

## Colors

- **Primary:** `#4D6BFE` is the main action color shared by the web and mobile products.
- **Canvas and surface:** `#FFFAF4` and white create a soft reading environment without relying on gradients.
- **Ink and muted:** dark ink carries hierarchy; muted text supports secondary explanation.
- **Lavender and apricot:** supporting accents only; never use them as the sole signal for errors or status.
- **Danger:** errors must pair color with Persian explanatory text and semantic announcement.

## Typography

Use the bundled `IRANSansX LearnBox` family for Persian UI. Preserve RTL flow. Isolate German words, phone numbers, and OTP values with LTR direction and appropriate bidi semantics.

## Layout

Use an RTL vertical rhythm based on 8px increments. Mobile content uses 20–24px horizontal padding, caps dense form content near 440dp on large devices, and keeps primary actions within comfortable thumb reach. Authentication is a Configure surface: one task, one dominant action, clear recovery.

## Elevation & Depth

Prefer flat white surfaces with thin lavender borders and restrained elevation. Do not use glassmorphism or heavy gradients as a substitute for hierarchy.

## Shapes

Primary controls are 56dp tall with 18dp radius. Cards use 20dp radius. A larger 28dp radius is reserved for an intentional feature surface, not every container. Interactive targets are at least 44dp.

## Components

Primary buttons are full-width where the task is sequential. Inputs have visible focus and error states. Loading preserves layout. Error and success states use iconography or text in addition to color. All controls need Persian semantics.

## Do's and Don'ts

- Do preserve the web app's copy tone and visual tokens.
- Do test 320dp, 360dp, and 412dp widths plus compact height.
- Do support keyboard-safe scrolling and reduced motion.
- Do use Bobo only when it adds reassurance or learning context.
- Don't introduce a generic SaaS card grid, arbitrary metrics, or decorative icons.
- Don't let authentication UI become reachable in default-disabled builds until composition is separately approved.
- Don't expose OTP, token, phone, or server response data in logs, analytics, screenshots, or evidence.
