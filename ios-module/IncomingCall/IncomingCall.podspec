require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'IncomingCall'
  s.version      = package['version']
  s.summary      = 'Pardon Me — CallKit/PushKit bridge for the fake-call flow.'
  s.homepage     = 'https://github.com/davidevans/pardon-me'
  s.license      = 'UNLICENSED'
  s.author       = 'David Evans'
  s.platforms    = { ios: '13.0' }
  s.source       = { git: '' }
  s.source_files = '*.{h,m,swift}'
  s.requires_arc = true
  # Explicit framework links: CocoaPods usually infers these from imports,
  # but declaring them avoids a class of "Undefined symbol" link error that
  # only surfaces at the final app-target link step, not during pod install —
  # cheaper to be explicit than to chase that failure mode blind next build.
  s.frameworks   = 'CallKit', 'PushKit', 'AVFoundation', 'MediaPlayer', 'UIKit', 'UserNotifications'

  s.dependency 'React-Core'
end
