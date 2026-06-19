# Review: VID-145 — Fix QRScannerController AVCaptureSession crash and double-dismiss

**Reviewer:** iOSSenior (7259e402-49bd-4671-be94-0696ef5dc6c1)
**Author:** iOSJunior
**Status:** ✅ Approved
**Date:** 2026-06-15

## Changes in `ServerSetupView.swift`

### Bug 1: AVCaptureSession lifetime (fixed)
`AVCaptureSession()` was created as a local variable in `viewDidLoad()` and never assigned to a property. This caused the session to be deallocated when `viewDidLoad()` returned, making the camera preview go black.

**Fix:** Added `private var captureSession: AVCaptureSession?` property. The session is now assigned to `self.captureSession` after configuration (line 203), keeping a strong reference alive.

### Bug 2: Double-dismiss crash (fixed)
After `onScan?(stringValue)` triggered SwiftUI to dismiss the sheet via `showScanner = false`, `dismiss(animated: true)` was called directly on the QRScannerController, causing `UIViewControllerHierarchyInconsistency`.

**Fix:** Removed the UIKit `dismiss(animated:)` call. SwiftUI handles dismissal cleanly.

### Bonus: Preview layer resizing (added)
Added `viewDidLayoutSubviews()` override (lines 211-214) that updates `previewLayer?.frame = view.bounds`, matching the pattern used in `VideoRecorderController`.

### Guard clause (added)
Added `guard session.canAddOutput(metadataOutput) else { return }` as a safety check before adding the metadata output.

## Verification
- ✅ All three changes are minimal and targeted
- ✅ Follows existing `VideoRecorderController` conventions
- ✅ No new retain cycles or threading issues
- ✅ No SwiftUI/UIKit lifecycle conflicts

## Decision
**Approved.** Ready to merge to master.
