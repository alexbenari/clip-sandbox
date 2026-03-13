# Feature Spec: Save and Load Ordered Collections

## 1. Summary

Redefine the current save/load order feature so a text file represents an `ordered collection`, not just a full-folder ordering.

An ordered collection is:
- a set of clip filenames drawn from one folder (the same folder the ordered collection file is in),
- in a specific display order,
- where the set may be the full folder or a subset of it.

Selecting a folder creates an implicit ordered collection containing every supported video file in that folder in the app's default natural filename order. Loading a collection file replaces that implicit collection with an explicit ordered collection.

## 2. Problem

Current behavior treats an order file as a strict permutation of all clips currently loaded in the grid. That no longer matches the desired product model.

Needed changes:
- the concept must expand from `order file` to `ordered collection`,
- a collection file must be allowed to describe only part of the folder,
- loading a subset collection must show only that subset,
- missing collection entries must produce actionable UI instead of a generic failure.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Make `ordered collection` the canonical concept in docs, UI text, and code.
2. Allow a collection file to describe either:
   - all clips in the selected folder, or
   - a subset of clips in the selected folder.
3. Make loading a collection replace the current working collection shown in the grid.
4. Save exactly the current working collection, including subset collections.
5. Keep the file format simple and backward-compatible: one filename per line.

### 3.2 Non-Goals

1. No recursive folder scanning.
2. No new structured file format such as JSON.
3. No support for identifying clips by anything other than filename.
4. No multi-folder collection support.

## 4. Core Concepts

### 4.1 Folder Contents

The supported video files physically present in the currently selected folder.

### 4.2 Implicit Collection

When the user selects a folder, the app creates an implicit ordered collection containing every supported video file in that folder in the default natural filename order.

### 4.3 Collection File

A plain-text file whose non-blank lines are clip filenames. The file describes an explicit ordered collection.

### 4.4 Current Working Collection

The collection currently displayed by the app. This is what the user sees in the grid and what `Save` writes to disk.

## 5. User Stories

1. As a user, when I load a folder, I immediately see the full implicit collection from that folder.
2. As a user, I can load a collection file that contains only some clips from the folder and see only those clips in the saved order.
3. As a user, if a collection file references missing clips, I get a clear explanation and can choose whether to continue with the clips that do exist.
4. As a user, when I save after loading or editing a subset collection, the saved file contains only that active collection.
5. As a user, I see collection-first loading only when the browser can actually resolve sibling files from the same folder.

## 6. UX Specification

### 6.1 Terminology

This feature replaces user-facing `order` terminology with collection terminology where the meaning is about a saved or loaded subset/order definition.

Expected terminology direction:
- `Load Order` -> `Load Collection`
- `Save Order` -> `Save Collection`
- `order file` -> `collection file`
- validation/status copy should refer to `collection` rather than `order`

The menu label may remain `Order` only if implementation constraints require a staged rename, but the preferred direction for this feature is a full rename.

### 6.2 Load Folder

When a folder is selected:
1. the app loads supported video files from that folder only,
2. creates the implicit collection,
3. displays every loaded clip in default natural filename order,
4. updates status text to indicate how many clips were loaded.

### 6.3 Load Collection File After Folder Is Already Loaded

When a collection file is chosen after a folder is loaded:
1. parse non-blank lines,
2. validate duplicates and basic file validity,
3. compare collection entries to actual video filenames in the selected folder,
4. apply behavior based on the comparison rules in section 7.

### 6.4 Load Collection File First

Collection-first loading is supported only when browser File System Access APIs are available and the app can obtain access to the collection file in a way that also allows resolving sibling files in the same folder.

Supported path:
1. user chooses a collection file,
2. app assumes the collection file is stored in the same folder as the clip files,
3. app resolves that folder's supported video files,
4. app creates an explicit collection from the file and displays it.

Unsupported path:
1. if File System Access APIs are unavailable, the app must not offer a broken collection-first flow,
2. instead it must show a clear in-app explanation that collection-first loading is not available in this browser,
3. it must tell the user to load the folder first and then load the collection file.

### 6.5 Missing-Entry Conflict UI

If a collection file contains entries not present in the selected folder, the app must show an inline in-app panel that:
- briefly explains the mismatch,
- states the number of missing collection entries,
- lists the missing filenames,
- offers:
  - `Display existing clips only`
  - `Cancel`

`Display existing clips only` applies the collection using only entries that exist in the folder, preserving the file's order among those existing entries.

`Cancel` leaves the current working collection unchanged.

## 7. Collection/File Relationship Rules

Given:
- `folder files`: the set of supported video filenames in the selected folder,
- `collection entries`: the set of filenames listed in the collection file.

### 7.1 Exact Match

If collection entries are exactly the same set as the folder files:
- apply the collection order,
- display all clips in the order listed by the file.

### 7.2 Partial Match

If collection entries are a strict subset of the folder files:
- apply the collection order,
- display only the listed clips,
- exclude unlisted folder clips from the current working collection and visible grid.

### 7.3 Collection Has Missing Entries

If collection entries include filenames that do not exist in the folder:
- show the missing-entry conflict UI,
- if the user chooses `Display existing clips only`, display only the listed clips that do exist,
- if none of the listed clips exist, do not switch the current collection and show a clear message,
- if the user chooses `Cancel`, keep the current working collection unchanged.

## 8. File Format Rules

### 8.1 Format

The collection file remains plain text:
- one filename per line,
- UTF-8 text is acceptable,
- blank lines are ignored.

### 8.2 Invalid File Cases

The following are invalid:
1. blank or whitespace-only file,
2. duplicate filenames in the collection file.

These cases must not apply a new collection.

### 8.3 Matching Rules

1. Matching is exact by filename string.
2. Matching is against files in the selected folder only.
3. Subfolders are ignored.
4. Filenames are assumed to be unique within the selected folder.

## 9. Save Behavior

### 9.1 What Save Writes

Save writes the current working collection exactly:
- if the working collection is the implicit full-folder collection, save all displayed clips,
- if the working collection is an explicit subset collection, save only that subset in its current order.

### 9.2 Default Filename

The default saved filename is:

`default-collection.txt`

### 9.3 Save Targets

If folder write access is available, write the file into the selected folder. Otherwise, download the file through the browser.

## 10. Status and Error Messages

The app should provide plain-language messaging for:
1. collection successfully applied,
2. collection partially applied after ignoring missing entries,
3. invalid blank collection,
4. duplicate entries in collection file,
5. collection-first loading unavailable in current browser,
6. failed read of collection file.

Messages should use `collection` terminology rather than `order` terminology.

## 11. Code and Architecture Impact

The feature should be reflected in code concepts as well as UI/docs:
- rename or reshape `order` domain logic toward collection semantics,
- replace strict full-grid validation with collection-aware comparison against folder contents,
- distinguish between:
  - all loaded folder files,
  - current working collection,
  - currently rendered grid contents.

The existing implementation currently validates against `getOrderArray()` from the visible grid. The new implementation must validate/apply against selected-folder contents so that subset collections and missing-entry decisions are handled correctly.

## 12. Testing Requirements

### 12.1 Unit

1. Exact-match collection passes and returns full ordered collection.
2. Partial-match collection passes and returns subset ordered collection.
3. Duplicate entries fail.
4. Blank collection file fails.
5. Missing-entry collections return the data needed to drive the inline decision UI.
6. Partial apply path preserves order among existing entries.

### 12.2 Integration

1. Collection load controller shows inline conflict panel when entries are missing.
2. `Display existing clips only` applies the filtered collection.
3. `Cancel` preserves the previous collection.
4. Status/error text uses collection terminology.

### 12.3 End-to-End

1. Load folder only and verify implicit full-folder collection is shown.
2. Load exact-match collection and verify full ordered display.
3. Load subset collection and verify only the subset is shown.
4. Load collection with missing entries and choose `Display existing clips only`.
5. Load collection with missing entries and choose `Cancel`.
6. Save after subset collection is active and verify only subset entries are written.
7. Verify collection-first path in supported-browser test setup.
8. Verify unsupported collection-first path shows guidance instead of broken behavior.

## 13. Acceptance Criteria

1. The app treats saved/loaded collection files as ordered collections rather than strict full-folder order definitions.
2. A collection file may represent either the full folder or a subset of it.
3. Loading a subset collection displays only that subset.
4. Missing entries produce an actionable inline decision UI.
5. Save writes exactly the current working collection to `default-collection.txt`.
6. Collection-first loading is capability-gated and has a clear fallback message when unsupported.
7. Docs, UI text, and code concepts reflect the ordered collection model.

## 14. Compatibility Notes

Because the file format stays as one filename per line, existing plain-text order files remain readable as legacy collection files. The semantic change is in how the app interprets files that list only a subset of folder contents.
