import SwiftUI
import PhotosUI
import AVFoundation

struct SendVideoView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var selectedVideoItem: PhotosPickerItem?
    @State private var selectedVideoURL: URL?
    @State private var isRecording = false
    @State private var showFriendPicker = false
    @State private var selectedFriendId: String?
    @State private var selectedFriendName: String?
    @State private var isUploading = false
    @State private var uploadProgress: Double = 0
    @State private var uploadError: String?
    @State private var uploadComplete = false
    @State private var source: VideoSource = .picker

    enum VideoSource: String, CaseIterable {
        case picker = "Choose"
        case record = "Record"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if uploadComplete {
                    uploadCompleteView
                } else if isUploading {
                    UploadProgressView(progress: uploadProgress, error: uploadError) {
                        await startUpload()
                    } onCancel: {
                        dismiss()
                    }
                } else {
                    sourcePicker
                    videoPreviewArea
                    friendSelectionArea
                    Spacer()
                    uploadButton
                }
            }
            .padding()
            .navigationTitle("Send Video")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityLabel("Cancel sending video")
                }
            }
            .sheet(isPresented: $showFriendPicker) {
                FriendPickerView { friend in
                    selectedFriendId = friend.id
                    selectedFriendName = friend.displayName ?? friend.username
                    showFriendPicker = false
                }
            }
        }
        .interactiveDismissDisabled(isUploading)
    }

    // MARK: - Source Toggle

    private var sourcePicker: some View {
        Picker("Source", selection: $source) {
            ForEach(VideoSource.allCases, id: \.self) { s in
                Text(s.rawValue).tag(s)
            }
        }
        .pickerStyle(.segmented)
        .disabled(isUploading)
        .accessibilityLabel("Video source")
        .accessibilityHint("Choose whether to pick a video from your library or record a new one")
    }

    // MARK: - Video Preview

    @ViewBuilder
    private var videoPreviewArea: some View {
        if source == .picker {
            pickerArea
        } else {
            recorderArea
        }
    }

    @ViewBuilder
    private var pickerArea: some View {
        PhotosPicker(selection: $selectedVideoItem, matching: .videos) {
            if selectedVideoURL != nil {
                Label("Change video", systemImage: "video.fill")
                    .accessibilityLabel("Change selected video")
            } else {
                ContentUnavailableView(
                    "Select a Video",
                    systemImage: "plus.viewfinder",
                    description: Text("Tap to choose from your library")
                )
                .accessibilityLabel("Select a video from your library")
            }
        }
        .onChange(of: selectedVideoItem) { _, newItem in
            Task { await loadVideo(from: newItem) }
        }
    }

    private var recorderArea: some View {
        ZStack(alignment: .bottom) {
            VideoRecorderView(isRecording: $isRecording, recordedURL: $selectedVideoURL)
                .frame(height: 300)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("Video preview")
                .accessibilityHint("Shows the camera feed for recording")

            if selectedVideoURL == nil {
                Button {
                    isRecording.toggle()
                } label: {
                    Image(systemName: isRecording ? "stop.circle.fill" : "record.circle")
                        .font(.system(size: 48))
                        .foregroundStyle(isRecording ? .red : .white)
                        .padding(8)
                        .background(.black.opacity(0.4), in: Circle())
                }
                .padding(.bottom, 12)
                .accessibilityLabel(isRecording ? "Stop recording" : "Start recording")
                .accessibilityHint(isRecording ? "Stops the current recording" : "Begins recording a video")
            } else {
                Label("Recording saved", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.green, in: Capsule())
                    .padding(.bottom, 8)
                    .accessibilityLabel("Recording saved successfully")
            }
        }
    }

    // MARK: - Friend Selection

    private var friendSelectionArea: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Send to")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Button {
                showFriendPicker = true
            } label: {
                HStack {
                    Image(systemName: "person.circle")
                        .accessibilityHidden(true)
                    Text(selectedFriendName ?? "Choose a friend...")
                        .foregroundStyle(selectedFriendName != nil ? .primary : .secondary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
                .padding()
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
            }
            .disabled(isUploading)
            .accessibilityLabel("Recipient: \(selectedFriendName ?? "none selected")")
            .accessibilityHint("Opens friend picker to choose who to send the video to")
        }
    }

    // MARK: - Upload

    private var uploadButton: some View {
        Button {
            Task { await startUpload() }
        } label: {
            Label("Send Video", systemImage: "paperplane.fill")
                .frame(maxWidth: .infinity)
                .padding()
        }
        .buttonStyle(.borderedProminent)
        .disabled(selectedVideoURL == nil || selectedFriendId == nil)
        .accessibilityLabel("Send video")
        .accessibilityHint("Sends the selected video to your chosen friend")
    }

    private var uploadCompleteView: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)
                .accessibilityHidden(true)
            Text("Video sent!")
                .font(.title2)
                .fontWeight(.semibold)
                .accessibilityAddTraits(.isHeader)
            Text("Your video has been sent to \(selectedFriendName ?? "your friend").")
                .foregroundStyle(.secondary)
            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel("Done, go back")
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Video sent successfully to \(selectedFriendName ?? "your friend").")
    }

    // MARK: - Actions

    private func loadVideo(from item: PhotosPickerItem?) async {
        guard let item else { return }
        do {
            if let url = try await item.loadTransferable(type: URL.self) {
                let tempDir = FileManager.default.temporaryDirectory
                let destination = tempDir.appendingPathComponent("picked-\(UUID().uuidString).mp4")
                if FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.removeItem(at: destination)
                }
                try FileManager.default.copyItem(at: url, to: destination)
                selectedVideoURL = destination
            }
        } catch {
            uploadError = "Failed to load video: \(error.localizedDescription)"
        }
    }

    private func startUpload() async {
        guard let videoURL = selectedVideoURL, let friendId = selectedFriendId else { return }
        isUploading = true
        uploadProgress = 0
        uploadError = nil

        do {
            let uploadURL = try await appState.apiClient.uploadVideo(
                fileURL: videoURL,
                fileName: "video-\(Date().timeIntervalSince1970).mp4",
                progress: { fraction in
                    Task { @MainActor in
                        self.uploadProgress = fraction
                    }
                }
            )
            let videoId = try await appState.apiClient.createVideo(url: uploadURL, title: nil, description: nil)
            try await appState.apiClient.sendVideo(id: videoId, toUserId: friendId)
            uploadComplete = true
        } catch {
            uploadError = error.localizedDescription
            isUploading = false
        }
    }
}
