import SwiftUI

/// サインイン画面。成功したトークンを onSignedIn で渡す
struct SignInView: View {
	let onSignedIn: (String) -> Void

	@State private var email = ""
	@State private var password = ""
	@State private var message: String?

	var body: some View {
		Form {
			TextField("メールアドレス", text: $email)
				.textContentType(.emailAddress)
				.keyboardType(.emailAddress)
				.textInputAutocapitalization(.never)
				.autocorrectionDisabled()
			SecureField("パスワード", text: $password)
			Button("サインイン") {
				Task { await signIn() }
			}
			if let message {
				Text(message).foregroundStyle(.red)
			}
		}
	}

	private func signIn() async {
		do {
			let token = try await APIClient().signIn(email: email, password: password)
			onSignedIn(token)
		} catch APIError.unauthorized {
			message = "メールアドレスかパスワードが違います"
		} catch {
			message = "サインインできませんでした"
		}
	}
}

#Preview {
	SignInView(onSignedIn: { _ in })
}
