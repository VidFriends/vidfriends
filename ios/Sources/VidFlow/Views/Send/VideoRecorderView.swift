import SwiftUI
import AVFoundation

struct VideoRecorderView: UIViewControllerRepresentable {
    @Binding var isRecording: Bool
    @Binding var recordedData: Data?

    func makeUIViewController(context: Context) -> VideoRecorderController {
        let controller = VideoRecorderController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: VideoRecorderController, context: Context) {
        if isRecording {
            uiViewController.startRecording()
        } else {
            uiViewController.stopRecording()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    final class Coordinator: NSObject {
        var parent: VideoRecorderView

        init(_ parent: VideoRecorderView) {
            self.parent = parent
        }
    }
}

final class VideoRecorderController: UIViewController {
    weak var delegate: Coordinator?

    private var captureSession: AVCaptureSession?
    private var videoOutput: AVCaptureMovieFileOutput?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var outputURL: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        setupCamera()
    }

    private func setupCamera() {
        let session = AVCaptureSession()
        session.sessionPreset = .high

        guard let camera = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: camera),
              session.canAddInput(input) else {
            showUnavailableLabel()
            return
        }
        session.addInput(input)

        let audioDevice = AVCaptureDevice.default(for: .audio)
        if let audioDevice, let audioInput = try? AVCaptureDeviceInput(device: audioDevice),
           session.canAddInput(audioInput) {
            session.addInput(audioInput)
        }

        let output = AVCaptureMovieFileOutput()
        guard session.canAddOutput(output) else {
            showUnavailableLabel()
            return
        }
        session.addOutput(output)
        videoOutput = output

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        previewLayer = preview
        view.layer.addSublayer(preview)

        captureSession = session
        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    func startRecording() {
        guard let output = videoOutput, !output.isRecording else { return }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("recording-\(UUID().uuidString)")
            .appendingPathExtension("mp4")
        outputURL = url
        output.startRecording(to: url, recordingDelegate: self)
    }

    func stopRecording() {
        videoOutput?.stopRecording()
    }

    private func showUnavailableLabel() {
        let label = UILabel()
        label.text = "Camera unavailable"
        label.textAlignment = .center
        label.textColor = .secondaryLabel
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        label.isAccessibilityElement = true
        label.accessibilityLabel = "Camera unavailable"
        label.accessibilityTraits = .staticText
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }
}

extension VideoRecorderController: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        if let error {
            print("Recording failed: \(error.localizedDescription)")
            return
        }
        guard let data = try? Data(contentsOf: outputFileURL) else { return }
        Task { @MainActor in
            self.delegate?.parent.recordedData = data
        }
    }
}
