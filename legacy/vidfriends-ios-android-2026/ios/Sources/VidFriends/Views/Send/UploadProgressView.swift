import SwiftUI

struct UploadProgressView: View {
    let progress: Double
    let error: String?
    let onRetry: () async -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            if let error {
                errorState
            } else {
                progressState
            }
        }
        .padding()
        .frame(maxHeight: .infinity)
    }

    // MARK: - Progress

    private var progressState: some View {
        VStack(spacing: 16) {
            Image(systemName: "arrow.up.doc.fill")
                .font(.system(size: 48))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            Text("Uploading video...")
                .font(.headline)

            ProgressView(value: progress) {
                Text("\(Int(progress * 100))%")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .progressViewStyle(.linear)
            .padding(.horizontal)
            .accessibilityLabel("Upload progress: \(Int(progress * 100)) percent")

            Button("Cancel", role: .cancel) {
                onCancel()
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Cancel upload")
        }
    }

    // MARK: - Error / Retry

    private var errorState: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.icloud.fill")
                .font(.system(size: 48))
                .foregroundStyle(.red)
                .accessibilityHidden(true)

            Text("Upload Failed")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            Text(error ?? "An unknown error occurred.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            HStack(spacing: 16) {
                Button("Cancel", role: .cancel) {
                    onCancel()
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Cancel and go back")

                Button {
                    Task { await onRetry() }
                } label: {
                    Label("Retry", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel("Retry upload")
                .accessibilityHint("Attempts to upload the video again")
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Upload failed. \(error ?? "Unknown error"). You can retry or cancel.")
    }
}
