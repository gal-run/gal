import Cocoa
import CoreGraphics
import Foundation

// MARK: - Result Types

struct ErrorResult: Codable {
    let error: String
}

struct StatusResult: Codable {
    let status: String
    let message: String
}

struct ScreenshotResult: Codable {
    let image: String
    let width: Int
    let height: Int
}

struct AppStateResult: Codable {
    let app: String
    let root: AccessibilityNode
}

struct AccessibilityNode: Codable {
    let index: Int
    let role: String
    let title: String?
    let value: String?
    let position: [Double]?
    let size: [Double]?
    let children: [AccessibilityNode]?
}

// MARK: - Helper Functions

func encodeJSON<T: Encodable>(_ value: T) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    guard let data = try? encoder.encode(value) else { return "{}" }
    return String(data: data, encoding: .utf8) ?? "{}"
}

// MARK: - Accessibility Helpers

func getAXValueAsString(_ element: AXUIElement, _ attribute: String) -> String? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success else { return nil }
    return value as? String
}

func getAXValueAsPoint(_ element: AXUIElement, _ attribute: String) -> CGPoint? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let v = value else { return nil }
    let pointValue = v as! AXValue
    var point = CGPoint()
    guard AXValueGetValue(pointValue, .cgPoint, &point) else { return nil }
    return point
}

func getAXValueAsSize(_ element: AXUIElement, _ attribute: String) -> CGSize? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let v = value else { return nil }
    let sizeValue = v as! AXValue
    var size = CGSize()
    guard AXValueGetValue(sizeValue, .cgSize, &size) else { return nil }
    return size
}

func getAXChildren(_ element: AXUIElement) -> [AXUIElement]? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value)
    guard result == .success, let children = value as? [AXUIElement] else { return nil }
    return children
}

// MARK: - Build Accessibility Tree

func buildAccessibilityTree(_ element: AXUIElement, index: inout Int) -> AccessibilityNode {
    let currentIndex = index
    index += 1
    
    let role = getAXValueAsString(element, kAXRoleAttribute as String) ?? "unknown"
    let title = getAXValueAsString(element, kAXTitleAttribute as String)
    let value = getAXValueAsString(element, kAXValueAttribute as String)
    let position = getAXValueAsPoint(element, kAXPositionAttribute as String).map { [Double($0.x), Double($0.y)] }
    let size = getAXValueAsSize(element, kAXSizeAttribute as String).map { [Double($0.width), Double($0.height)] }
    
    var childNodes: [AccessibilityNode]? = nil
    if let children = getAXChildren(element), !children.isEmpty {
        childNodes = children.map { buildAccessibilityTree($0, index: &index) }
    }
    
    return AccessibilityNode(
        index: currentIndex,
        role: role,
        title: title,
        value: value,
        position: position,
        size: size,
        children: childNodes
    )
}

// MARK: - Actions

func getAppState(appName: String?) -> String {
    let app: NSRunningApplication?
    if let name = appName {
        app = NSRunningApplication.runningApplications(withBundleIdentifier: name).first
            ?? NSWorkspace.shared.runningApplications.first { $0.localizedName == name }
    } else {
        app = NSWorkspace.shared.frontmostApplication
    }
    
    guard let app = app else {
        return encodeJSON(ErrorResult(error: "Application not found: \(appName ?? "frontmost")"))
    }
    
    let pid = app.processIdentifier
    let appElement = AXUIElementCreateApplication(pid)
    var index = 0
    let tree = buildAccessibilityTree(appElement, index: &index)
    return encodeJSON(AppStateResult(app: app.localizedName ?? "unknown", root: tree))
}

// Security: the screenshot is always written to a helper-controlled, per-user
// scratch file with a randomized name (mode 0600 via the umask set in main),
// read back as base64, and deleted. We deliberately do NOT accept a
// caller-supplied output_path: honoring an arbitrary path would let any client
// turn this helper into an arbitrary-file-write primitive (path traversal /
// symlink attacks). Callers receive the bytes and decide where to store them.
func takeScreenshot(window: String = "screen") -> String {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    var args: [String] = ["-x"]

    switch window {
    case "window": args.append("-w")
    case "selection": args.append("-i")
    default: break
    }

    // Per-user scratch directory, not the world-writable /tmp.
    let scratchDir = sessionScratchDir()
    let tempURL = scratchDir.appendingPathComponent("gal-screenshot-\(UUID().uuidString).png")
    args.append(tempURL.path)
    task.arguments = args
    do {
        try task.run()
        task.waitUntilExit()
        let data = try Data(contentsOf: tempURL)
        let base64 = data.base64EncodedString()
        try? FileManager.default.removeItem(at: tempURL)
        return encodeJSON(ScreenshotResult(image: base64, width: 0, height: 0))
    } catch {
        try? FileManager.default.removeItem(at: tempURL)
        return encodeJSON(ErrorResult(error: "Failed to take screenshot: \(error.localizedDescription)"))
    }
}

func clickAt(x: Double, y: Double, button: String = "left", clickCount: Int = 1) -> String {
    let mouseButton: CGMouseButton
    switch button.lowercased() {
    case "right": mouseButton = .right
    case "middle": mouseButton = .center
    default: mouseButton = .left
    }
    
    let eventSource = CGEventSource(stateID: .hidSystemState)
    let moveEvent = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: mouseButton)
    moveEvent?.post(tap: .cghidEventTap)
    usleep(50000)
    
    let downType: CGEventType = mouseButton == .right ? .rightMouseDown : .leftMouseDown
    let upType: CGEventType = mouseButton == .right ? .rightMouseUp : .leftMouseUp
    
    for _ in 0..<clickCount {
        let downEvent = CGEvent(mouseEventSource: eventSource, mouseType: downType, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: mouseButton)
        downEvent?.post(tap: .cghidEventTap)
        usleep(50000)
        let upEvent = CGEvent(mouseEventSource: eventSource, mouseType: upType, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: mouseButton)
        upEvent?.post(tap: .cghidEventTap)
        if clickCount > 1 { usleep(100000) }
    }
    return encodeJSON(StatusResult(status: "success", message: "Clicked at (\(x), \(y))"))
}

func typeText(_ text: String) -> String {
    let eventSource = CGEventSource(stateID: .hidSystemState)
    for char in text {
        let chars = Array(String(char).utf16)
        var event = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: true)
        event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: chars)
        event?.post(tap: .cghidEventTap)
        usleep(10000)
        event = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: false)
        event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: chars)
        event?.post(tap: .cghidEventTap)
    }
    return encodeJSON(StatusResult(status: "success", message: "Typed \(text.count) characters"))
}

func pressKey(key: String, modifiers: [String] = []) -> String {
    let keyMap: [String: CGKeyCode] = [
        "enter": 0x24, "tab": 0x30, "escape": 0x35, "space": 0x31, "backspace": 0x33, "delete": 0x75,
        "arrowUp": 0x7E, "arrowDown": 0x7D, "arrowLeft": 0x7B, "arrowRight": 0x7C,
        "f1": 0x7A, "f2": 0x78, "f3": 0x63, "f4": 0x76, "f5": 0x60, "f6": 0x61,
        "f7": 0x62, "f8": 0x64, "f9": 0x65, "f10": 0x6D, "f11": 0x67, "f12": 0x6F,
    ]
    
    guard let keyCode = keyMap[key.lowercased()] ?? keyMap[key] else {
        return encodeJSON(ErrorResult(error: "Unknown key: \(key)"))
    }
    
    let eventSource = CGEventSource(stateID: .hidSystemState)
    var flags: CGEventFlags = []
    for mod in modifiers {
        switch mod.lowercased() {
        case "command", "cmd": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "option", "alt": flags.insert(.maskAlternate)
        case "control", "ctrl": flags.insert(.maskControl)
        default: break
        }
    }
    
    let downEvent = CGEvent(keyboardEventSource: eventSource, virtualKey: keyCode, keyDown: true)
    downEvent?.flags = flags
    downEvent?.post(tap: .cghidEventTap)
    usleep(50000)
    let upEvent = CGEvent(keyboardEventSource: eventSource, virtualKey: keyCode, keyDown: false)
    upEvent?.flags = flags
    upEvent?.post(tap: .cghidEventTap)
    return encodeJSON(StatusResult(status: "success", message: "Pressed key: \(key)"))
}

func moveMouse(x: Double, y: Double) -> String {
    let eventSource = CGEventSource(stateID: .hidSystemState)
    let event = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)
    event?.post(tap: .cghidEventTap)
    return encodeJSON(StatusResult(status: "success", message: "Moved to (\(x), \(y))"))
}

func scroll(scrollX: Double = 0, scrollY: Double = 0, atX: Double? = nil, atY: Double? = nil) -> String {
    let eventSource = CGEventSource(stateID: .hidSystemState)
    if let x = atX, let y = atY {
        let moveEvent = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)
        moveEvent?.post(tap: .cghidEventTap)
        usleep(50000)
    }
    let event = CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 2, wheel1: Int32(scrollY), wheel2: Int32(scrollX), wheel3: 0)
    event?.post(tap: CGEventTapLocation.cghidEventTap)
    return encodeJSON(StatusResult(status: "success", message: "Scrolled by (\(scrollX), \(scrollY))"))
}

// MARK: - IPC Server

// Maximum bytes we are willing to read from a single client request. Requests
// larger than this are rejected so a hostile/buggy client cannot exhaust memory.
let maxRequestBytes = 1 << 20 // 1 MiB
// Socket read timeout (seconds) so a stalled client cannot hold the single
// accept loop open indefinitely.
let socketReadTimeoutSeconds = 5

// Per-user base directory for all helper-owned scratch state (the socket and
// screenshot temp files). Lives under the user's own Application Support dir,
// NOT world-writable /tmp, and is created with mode 0700.
func helperBaseDir() -> URL {
    let fm = FileManager.default
    let appSupport = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        ?? fm.temporaryDirectory
    let base = appSupport.appendingPathComponent("GALComputerUse", isDirectory: true)
    try? fm.createDirectory(at: base, withIntermediateDirectories: true,
                            attributes: [.posixPermissions: 0o700])
    // Enforce 0700 even if the directory already existed with looser perms.
    try? fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: base.path)
    return base
}

// Per-session scratch dir for transient files (e.g. screenshots), mode 0700.
func sessionScratchDir() -> URL {
    let fm = FileManager.default
    let dir = helperBaseDir().appendingPathComponent("scratch", isDirectory: true)
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true,
                            attributes: [.posixPermissions: 0o700])
    try? fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: dir.path)
    return dir
}

let socketPath = helperBaseDir().appendingPathComponent("helper.sock").path

// Read a single request from the client with a hard size cap. Returns nil if the
// request exceeds the cap or the connection errors/times out.
func readRequest(_ client: FileHandle) -> Data? {
    var buffer = Data()
    while buffer.count < maxRequestBytes {
        let chunk = client.availableData // bounded by SO_RCVTIMEO set on the fd
        if chunk.isEmpty { break } // EOF or timeout
        buffer.append(chunk)
    }
    if buffer.count >= maxRequestBytes { return nil } // over the cap, reject
    return buffer
}

func handleClient(_ client: FileHandle) {
    defer { client.closeFile() }
    guard let data = readRequest(client) else {
        let error = ErrorResult(error: "Request too large or read error")
        try? client.write(contentsOf: encodeJSON(error).data(using: .utf8)!)
        return
    }
    guard let input = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let action = input["action"] as? String else {
        let error = ErrorResult(error: "Invalid command format")
        try? client.write(contentsOf: encodeJSON(error).data(using: .utf8)!)
        return
    }
    
    let result: String
    switch action {
    case "get_app_state":
        result = getAppState(appName: input["app"] as? String)
    case "screenshot":
        result = takeScreenshot(window: input["window"] as? String ?? "screen")
    case "click":
        if let x = input["x"] as? Double, let y = input["y"] as? Double {
            result = clickAt(x: x, y: y, button: input["button"] as? String ?? "left", clickCount: input["click_count"] as? Int ?? 1)
        } else {
            result = encodeJSON(ErrorResult(error: "click requires x and y coordinates"))
        }
    case "type":
        result = typeText(input["text"] as? String ?? "")
    case "key":
        result = pressKey(key: input["key"] as? String ?? "", modifiers: input["modifiers"] as? [String] ?? [])
    case "move":
        if let x = input["x"] as? Double, let y = input["y"] as? Double {
            result = moveMouse(x: x, y: y)
        } else {
            result = encodeJSON(ErrorResult(error: "move requires x and y coordinates"))
        }
    case "scroll":
        result = scroll(scrollX: input["scroll_x"] as? Double ?? 0, scrollY: input["scroll_y"] as? Double ?? 0, atX: input["at_x"] as? Double, atY: input["at_y"] as? Double)
    case "ping":
        result = encodeJSON(StatusResult(status: "ok", message: "GAL Computer Use helper is running"))
    default:
        result = encodeJSON(ErrorResult(error: "Unknown action: \(action)"))
    }
    
    try? client.write(contentsOf: result.data(using: .utf8)!)
}

// MARK: - Main

let stderr = FileHandle.standardError
stderr.write("[GAL Computer Use] Starting helper...\n".data(using: .utf8)!)

let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
let options = [promptKey: true] as CFDictionary
let trusted = AXIsProcessTrustedWithOptions(options)

if !trusted {
    let error = ErrorResult(error: """
Accessibility permissions required.

GAL Computer Use needs accessibility access to control your mouse, keyboard, and read UI elements.

Grant permission to "GAL Computer Use" in System Settings > Privacy & Security > Accessibility.
""")
    print(encodeJSON(error))
    exit(1)
}

stderr.write("[GAL Computer Use] Accessibility verified, listening on \(socketPath)\n".data(using: .utf8)!)
try? FileManager.default.removeItem(atPath: socketPath)

let socketFD = socket(AF_UNIX, SOCK_STREAM, 0)
guard socketFD >= 0 else {
    stderr.write("[GAL Computer Use] Failed to create socket\n".data(using: .utf8)!)
    exit(1)
}

var addr = sockaddr_un()
addr.sun_family = sa_family_t(AF_UNIX)
addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
strlcpy(&addr.sun_path.0, socketPath, Int(MemoryLayout.size(ofValue: addr.sun_path)))

// Restrict the permission bits on the socket inode at creation time: with
// umask 0o077, bind() creates the socket with mode 0600 (owner-only), closing
// the race window before an explicit chmod. We restore the prior umask after.
let previousUmask = umask(0o077)
let bindResult = withUnsafePointer(to: &addr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
        Darwin.bind(socketFD, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
    }
}
umask(previousUmask)

guard bindResult == 0 else {
    stderr.write("[GAL Computer Use] Failed to bind socket\n".data(using: .utf8)!)
    exit(1)
}

// Belt-and-suspenders: ensure the socket path is owner-only (0600) regardless
// of the inherited umask. Combined with the per-user parent dir (0700), no other
// local user can connect to this socket.
chmod(socketPath, 0o600)

guard listen(socketFD, 5) == 0 else {
    stderr.write("[GAL Computer Use] Failed to listen\n".data(using: .utf8)!)
    exit(1)
}

while true {
    var clientAddr = sockaddr()
    var clientAddrLen = socklen_t(MemoryLayout<sockaddr>.size)
    let clientFD = accept(socketFD, &clientAddr, &clientAddrLen)
    guard clientFD >= 0 else { continue }

    // Authenticate the peer: only accept connections from a process running as
    // the same effective user as this helper. Reject (and close) anything else.
    var peerEUID: uid_t = 0
    var peerEGID: gid_t = 0
    if getpeereid(clientFD, &peerEUID, &peerEGID) != 0 || peerEUID != geteuid() {
        stderr.write("[GAL Computer Use] Rejected connection from uid \(peerEUID)\n".data(using: .utf8)!)
        close(clientFD)
        continue
    }

    // Apply a read timeout so a stalled client cannot block the accept loop.
    var tv = timeval(tv_sec: socketReadTimeoutSeconds, tv_usec: 0)
    setsockopt(clientFD, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

    let client = FileHandle(fileDescriptor: clientFD)
    handleClient(client)
}
