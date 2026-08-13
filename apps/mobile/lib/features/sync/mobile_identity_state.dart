/// Authentication state reported by the identity port.
///
/// A later authentication adapter owns credential storage and derives this
/// state. The coordinator never accepts a phone number, OTP, user ID, cookie,
/// access token, refresh token or provider value as a method argument.
enum MobileIdentityState {
  signedOut,
  authenticated,
}
