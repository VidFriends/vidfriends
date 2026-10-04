import SwiftUI

struct OnboardingAuthView: View {
    @Environment(AppState.self) private var appState
    let coordinator: OnboardingCoordinator

    @State private var mode: AuthMode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var username = ""
    @State private var displayName = ""
    @State private var inviteCode = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    enum AuthMode: String, CaseIterable {
        case login = "Log In"
        case signup = "Sign Up"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Spacer().frame(height: 20)

                Text(mode == .login ? "Welcome Back" : "Create Account")
                    .font(.title2)
                    .fontWeight(.bold)

                Picker("Mode", selection: $mode) {
                    ForEach(AuthMode.allCases, id: \.self) { m in
                        Text(m.rawValue).tag(m)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                VStack(spacing: 14) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(10)

                    SecureField("Password", text: $password)
                        .textContentType(mode == .login ? .password : .newPassword)
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(10)

                    if mode == .signup {
                        TextField("Username", text: $username)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(10)

                        TextField("Display Name (optional)", text: $displayName)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(10)

                        TextField("Admin Invite Code", text: $inviteCode)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(10)

                        Text("An admin invite code is required to register.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Button(action: submit) {
                    HStack {
                        if isSubmitting {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(isSubmitting ? "Please wait…" : mode.rawValue)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(canSubmit ? Color.accentColor : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .disabled(!canSubmit || isSubmitting)
                .padding(.horizontal)

                Spacer()
            }
        }
        .interactiveDismissDisabled()
    }

    private var canSubmit: Bool {
        guard !email.trimmingCharacters(in: .whitespaces).isEmpty,
              !password.trimmingCharacters(in: .whitespaces).isEmpty else {
            return false
        }
        if mode == .signup {
            return !username.trimmingCharacters(in: .whitespaces).isEmpty &&
                   !inviteCode.trimmingCharacters(in: .whitespaces).isEmpty
        }
        return true
    }

    private func submit() {
        isSubmitting = true
        errorMessage = nil

        Task {
            do {
                let token: String
                if mode == .login {
                    token = try await appState.apiClient.login(email: email, password: password)
                } else {
                    token = try await appState.apiClient.registerWithInvite(
                        email: email,
                        username: username,
                        password: password,
                        displayName: displayName.isEmpty ? nil : displayName,
                        inviteCode: inviteCode
                    )
                }
                await MainActor.run {
                    isSubmitting = false
                    coordinator.didAuthenticate(token: token)
                }
            } catch {
                await MainActor.run {
                    isSubmitting = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}
