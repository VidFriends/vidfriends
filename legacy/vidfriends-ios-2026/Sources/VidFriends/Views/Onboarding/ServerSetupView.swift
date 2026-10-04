import SwiftUI
import AVFoundation

struct ServerSetupView: View {
    @Environment(AppState.self) private var appState
    let coordinator: OnboardingCoordinator

    @State private var urlString = ""
    @State private var isTesting = false
    @State private var showScanner = false

    private enum ConnectionStatus {
        case idle
        case testing
        case success(URL)
        case failure(String)
    }

    @State private var connectionStatus: ConnectionStatus = .idle

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer().frame(height: 40)

                Image(systemName: "video.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)

                Text("VidFriends")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .accessibilityAddTraits(.isHeader)

                Text("Connect to your self-hosted server")
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 6) {
                    TextField("https://your-server.com", text: $urlString)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                        .onChange(of: urlString) { _, _ in
                            connectionStatus = .idle
                        }
                        .accessibilityLabel("Server URL input")

                    if case .failure(let message) = connectionStatus {
                        statusRow(icon: "xmark.circle.fill", color: .red, message: message)
                    }
                }

                VStack(spacing: 12) {
                    Button(action: testConnection) {
                        HStack(spacing: 8) {
                            if isTesting {
                                ProgressView()
                                    .tint(.white)
                            }
                            Image(systemName: "antenna.radiowaves.left.and.right")
                            Text(isTesting ? "Testing…" : "Test Connection")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(canTest ? Color.accentColor : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(!canTest || isTesting)
                    .accessibilityLabel("Test Connection")
                    .accessibilityHint("Verifies the server URL is reachable")

                    Button(action: { showScanner = true }) {
                        HStack(spacing: 8) {
                            Image(systemName: "qrcode.viewfinder")
                            Text("Scan QR Code")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray5))
                        .foregroundColor(.primary)
                        .cornerRadius(10)
                    }
                    .accessibilityLabel("Scan QR Code")
                    .accessibilityHint("Opens camera to scan a QR code with the server URL")
                }

                if case .success(let url) = connectionStatus {
                    VStack(spacing: 16) {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                                .font(.title2)
                            Text("Connected")
                                .foregroundStyle(.green)
                                .fontWeight(.semibold)
                        }
                        .accessibilityLabel("Connected to server")

                        Button(action: { proceedToAuth(url: url) }) {
                            HStack(spacing: 8) {
                                Image(systemName: "arrow.right")
                                Text("Continue")
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .accessibilityLabel("Continue to login")
                        .accessibilityHint("Proceed with the connected server")
                    }
                    .padding(.top, 8)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .animation(.easeInOut(duration: 0.3), value: connectionStatus)
        .sheet(isPresented: $showScanner) {
            QRScannerView { code in
                urlString = code
                showScanner = false
            }
        }
    }

    private func statusRow(icon: String, color: Color, message: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .foregroundStyle(color)
            Text(message)
                .foregroundStyle(color)
                .font(.caption)
        }
        .accessibilityLabel(message)
    }

    private var canTest: Bool {
        !urlString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func sanitizedURL(from string: String) -> URL? {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let url = URL(string: trimmed), url.scheme != nil {
            return url
        }
        return URL(string: "https://\(trimmed)")
    }

    private func testConnection() {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = Self.sanitizedURL(from: trimmed) else {
            connectionStatus = .failure("Enter a valid URL (e.g. https://videos.example.com)")
            return
        }

        isTesting = true
        connectionStatus = .testing

        let previousConfig = appState.apiConfig
        appState.setEnvironment(baseURL: url, useStub: false)

        Task {
            do {
                let healthy = try await appState.apiClient.checkHealth()
                await MainActor.run {
                    isTesting = false
                    if healthy {
                        connectionStatus = .success(url)
                    } else {
                        connectionStatus = .failure("Server is not healthy. Check the URL and try again.")
                        appState.setEnvironment(baseURL: previousConfig.baseURL, useStub: previousConfig.useStub)
                    }
                }
            } catch {
                await MainActor.run {
                    isTesting = false
                    let message: String
                    if let apiError = error as? APIError {
                        message = apiError.errorDescription ?? "Could not reach server."
                    } else {
                        message = "Could not reach server: \(error.localizedDescription)"
                    }
                    connectionStatus = .failure(message)
                    appState.setEnvironment(baseURL: previousConfig.baseURL, useStub: previousConfig.useStub)
                }
            }
        }
    }

    private func proceedToAuth(url: URL) {
        coordinator.didConnect(to: url)
    }
}

// MARK: - QR Scanner

struct QRScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerController {
        let controller = QRScannerController()
        controller.onScan = onScan
        return controller
    }

    func updateUIViewController(_ uiViewController: QRScannerController, context: Context) {}
}

final class QRScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((String) -> Void)?

    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?

    deinit {
        if let session = captureSession, session.isRunning {
            session.stopRunning()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if let session = captureSession, session.isRunning {
            session.stopRunning()
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        guard let captureDevice = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: captureDevice) else {
            let label = UILabel()
            label.text = "Camera unavailable"
            label.textColor = .white
            label.textAlignment = .center
            view.addSubview(label)
            label.frame = view.bounds
            label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            return
        }

        let session = AVCaptureSession()
        session.addInput(input)

        let metadataOutput = AVCaptureMetadataOutput()
        guard session.canAddOutput(metadataOutput) else { return }
        session.addOutput(metadataOutput)
        metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
        metadataOutput.metadataObjectTypes = [.qr]

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.frame = view.layer.bounds
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)

        captureSession = session
        previewLayer = preview

        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringValue = object.stringValue else { return }
        onScan?(stringValue)
    }
}
