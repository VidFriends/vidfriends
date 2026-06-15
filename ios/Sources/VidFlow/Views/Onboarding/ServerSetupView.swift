import SwiftUI
import AVFoundation

struct ServerSetupView: View {
    @Environment(AppState.self) private var appState
    let coordinator: OnboardingCoordinator

    @State private var urlString = ""
    @State private var urlError: String?
    @State private var isTesting = false
    @State private var testSuccess = false
    @State private var showScanner = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer().frame(height: 40)

                Image(systemName: "video.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)

                Text("VidFlow")
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
                            urlError = nil
                            testSuccess = false
                        }

                    if let urlError {
                        Text(urlError)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                VStack(spacing: 12) {
                    Button(action: testConnection) {
                        HStack {
                            if isTesting {
                                ProgressView()
                                    .tint(.white)
                            }
                            Text(isTesting ? "Testing…" : "Test Connection")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(canTest ? Color.accentColor : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(!canTest || isTesting)

                    Button(action: { showScanner = true }) {
                        HStack {
                            Image(systemName: "qrcode.viewfinder")
                            Text("Scan QR Code")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray5))
                        .foregroundColor(.primary)
                        .cornerRadius(10)
                    }
                }

                if testSuccess {
                    Button(action: proceedToAuth) {
                        Text("Continue")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    .padding(.top, 8)
                }

                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .sheet(isPresented: $showScanner) {
            QRScannerView { code in
                urlString = code
                showScanner = false
            }
        }
    }

    private var canTest: Bool {
        !urlString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func testConnection() {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme != nil else {
            urlError = "Enter a valid URL (e.g. https://videos.example.com)"
            return
        }
        isTesting = true
        urlError = nil
        testSuccess = false

        let previousConfig = appState.apiConfig
        appState.setEnvironment(baseURL: url, useStub: false)

        Task {
            do {
                let healthy = try await appState.apiClient.checkHealth()
                await MainActor.run {
                    isTesting = false
                    if healthy {
                        testSuccess = true
                        coordinator.didConnect(to: url)
                    } else {
                        urlError = "Server is not healthy. Check the URL and try again."
                        appState.setEnvironment(baseURL: previousConfig.baseURL, useStub: previousConfig.useStub)
                    }
                }
            } catch {
                await MainActor.run {
                    isTesting = false
                    urlError = "Could not reach server: \(error.localizedDescription)"
                    appState.setEnvironment(baseURL: previousConfig.baseURL, useStub: previousConfig.useStub)
                }
            }
        }
    }

    private func proceedToAuth() {
        guard let url = coordinator.serverURL else { return }
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
        session.addOutput(metadataOutput)
        metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
        metadataOutput.metadataObjectTypes = [.qr]

        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.frame = view.layer.bounds
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)

        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringValue = object.stringValue else { return }
        onScan?(stringValue)
        dismiss(animated: true)
    }
}
