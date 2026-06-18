import UIKit
import Social
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {

    private var videoURL: URL?
    private var sharedVideoURL: URL?
    private var isUploading = false
    private var recipientUserId: String?
    private var recipientDisplayName: String?

    private lazy var keychainService = KeychainService(useAppGroup: true)

    override func viewDidLoad() {
        super.viewDidLoad()
        placeholder = "Add a caption..."
        handleIncomingItems()
    }

    override func isContentValid() -> Bool {
        return videoURL != nil && !isUploading
    }

    override func didSelectPost() {
        isUploading = true
        validateContent()

        Task {
            await uploadAndSend()
        }
    }

    override func didSelectCancel() {
        if isUploading {
            let alert = UIAlertController(
                title: "Upload in Progress",
                message: "Please wait until the upload finishes.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
            return
        }
        super.didSelectCancel()
    }

    override func configurationItems() -> [Any]! {
        let recipientItem = SLComposeSheetConfigurationItem()!
        recipientItem.title = "Send To"
        recipientItem.value = recipientDisplayName ?? "Select a friend..."
        recipientItem.tapHandler = { [weak self] in
            self?.presentFriendSearch()
        }
        return [recipientItem]
    }

    private func handleIncomingItems() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return }

        for item in items {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.movie.identifier, options: nil) { [weak self] (item, error) in
                        guard let self, error == nil else { return }
                        if let url = item as? URL {
                            let tempURL = FileManager.default.temporaryDirectory
                                .appendingPathComponent("share-\(UUID().uuidString).mp4")
                            do {
                                try FileManager.default.copyItem(at: url, to: tempURL)
                            } catch {
                                showError("Failed to access video: \(error.localizedDescription)")
                                return
                            }
                            DispatchQueue.main.async {
                                self.videoURL = tempURL
                                self.sharedVideoURL = url
                                self.validateContent()
                            }
                        } else if let data = item as? Data {
                            let tempURL = FileManager.default.temporaryDirectory
                                .appendingPathComponent("share-\(UUID().uuidString).mp4")
                            do {
                                try data.write(to: tempURL)
                            } catch {
                                showError("Failed to access video: \(error.localizedDescription)")
                                return
                            }
                            DispatchQueue.main.async {
                                self.videoURL = tempURL
                                self.validateContent()
                            }
                        }
                    }
                    break
                }
            }
        }
    }

    private func uploadAndSend() async {
        guard let videoURL else {
            showError("No video found to share.")
            return
        }

        guard let token = keychainService.loadToken(),
              let serverURL = keychainService.loadServerURL() else {
            showError("Please log in to VidFriends first.")
            return
        }

        let config = APIConfig(baseURL: serverURL, token: token)
        let client = APIClient(config: config, keychainService: keychainService)
        let fileName = "share-\(Date().timeIntervalSince1970).mp4"

        do {
            let uploadURL = try await client.uploadVideo(
                fileURL: videoURL,
                fileName: fileName,
                progress: { [weak self] fraction in
                    Task { @MainActor in
                        self?.updateProgress(fraction)
                    }
                }
            )
            let caption = contentText?.isEmpty == false ? contentText : nil
            let videoId = try await client.createVideo(url: uploadURL, title: caption, description: nil)

            if let recipientUserId {
                try await client.sendVideo(id: videoId, toUserId: recipientUserId)
            }

            try? FileManager.default.removeItem(at: videoURL)

            extensionContext?.completeRequest(returningItems: nil) { _ in }
        } catch {
            showError("Share failed: \(error.localizedDescription)")
        }
    }

    private func presentFriendSearch() {
        let alert = UIAlertController(
            title: "Send To",
            message: "Enter a friend's username or email:",
            preferredStyle: .alert
        )
        alert.addTextField { textField in
            textField.placeholder = "Username or email"
            textField.autocapitalizationType = .none
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Search", style: .default) { [weak self] _ in
            guard let query = alert.textFields?.first?.text, !query.isEmpty else { return }
            Task { @MainActor in
                await self?.resolveRecipient(query: query)
            }
        })
        present(alert, animated: true)
    }

    private func resolveRecipient(query: String) async {
        guard let token = keychainService.loadToken(),
              let serverURL = keychainService.loadServerURL() else { return }
        let config = APIConfig(baseURL: serverURL, token: token)
        let client = APIClient(config: config, keychainService: keychainService)
        do {
            let results = try await client.searchUsers(query: query)
            if let match = results.first {
                recipientUserId = match.id
                recipientDisplayName = match.displayName ?? match.username
                reloadConfigurationItems()
            } else {
                showError("No user found for \"\(query)\".")
            }
        } catch {
            showError("Search failed: \(error.localizedDescription)")
        }
    }

    private func updateProgress(_ fraction: Double) {
        let percent = Int(fraction * 100)
        title = "Uploading... \(percent)%"
    }

    private func showError(_ message: String) {
        Task { @MainActor in
            isUploading = false
            let alert = UIAlertController(
                title: "Share Failed",
                message: message,
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
                self?.extensionContext?.cancelRequest(withError: NSError(
                    domain: "com.vidfriends.share",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: message]
                ))
            })
            present(alert, animated: true)
        }
    }
}
