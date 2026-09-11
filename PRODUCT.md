# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The current primary and only user is the product's creator, working on Windows with a personal collection of short, GIF-like video clips extracted from movies. The central job is to manage that collection efficiently and expand it by creating new clips from existing clips.

## Product Purpose

Clip Sandbox supports the continuing life of a personal movie-clip collection: reviewing and organizing existing clips, creating derived clips, and progressively adding richer ways to find, understand, and compose the collection. Success means that collection management and creative expansion feel like one coherent workflow rather than separate tools and processes.

## Positioning

The product is distinguished by integrating multiple stages of working with a clip collection: managing it, expanding it from its own contents, and, in the planned direction, searching clips, enriching them with metadata, and composing them into layouts. Its folder-based storage is an implementation and workflow fact, not the differentiating product claim.

## Operating Context

- The product is a local Electron desktop application used primarily on Windows.
- A working session opens one local folder containing video clips and lightweight text-file collections.
- Current workflows include browsing the full collection, switching among saved collections, selecting and reordering clips, saving collections, adding clips to collections, deleting clips, zooming and reviewing clips, using fullscreen review, and creating a looped derivative from an existing clip.
- The source material is a growing collection of short, GIF-like clips extracted from movies.

## Capabilities and Constraints

- The application is local and Windows-first today.
- The architecture should preserve cross-platform capability as a forward-looking choice, although non-Windows platforms are not regularly tested or exercised and should not be presented as confirmed support.
- The renderer is framework-free TypeScript/HTML/CSS inside Electron and should remain framework-free for now.
- Current collection persistence is transparent and folder-based: clips remain ordinary video files and saved collections are lightweight text files.
- Current derived-clip creation includes the built-in `Loopify` edit.
- Search, metadata enrichment, and layout composition are confirmed future directions, not current capabilities.
- The application is currently developer-run and does not yet have an installer, packaged executable, code signing, or automatic updates.

## Brand Commitments

- Product name: Clip Sandbox.
- The product should remain centered on a niche, creator-shaped workflow rather than being generalized into a conventional media-library product.

## Evidence on Hand

- The repository contains a working Electron implementation of the current review, collection-management, and derived-clip workflows, with unit, integration, and end-to-end coverage.
- The repository contains local video fixtures, sandbox demonstrations, and playback experiments that can support future product work.
- No external customer evidence, testimonials, usage benchmarks, or cross-platform qualification evidence is currently established; future work must not fabricate them.

## Product Principles

1. Treat managing and creatively expanding the clip collection as one continuous workflow.
2. Preserve the user's direct relationship with local media and understandable collection data.
3. Design first for the real Windows-based personal workflow while keeping cross-platform architecture viable.
4. Grow toward search, metadata, and composition without turning the product into a generic asset manager.
5. Distinguish implemented capabilities from forward-looking product direction.
