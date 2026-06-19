cask "gal" do
  arch arm: "arm64", intel: "x64"

  version "0.0.667"
  sha256 arm:    "83f1c5363aab0494d857ae3bca6a5d738d95ccf2aa2b2034e992b4e1cd5d22e4",
         x86_64: "f7734a0e88c6355b6741fbb604c79bc12b6585a734c4c3018a062aa4bc947657"

  url "https://github.com/Scheduler-Systems/gal-run/releases/download/v0.0.667/gal-#{version}-darwin-#{arch}.tar.gz"
  name "GAL"
  desc "CLI for GAL — AI agent configuration governance"
  homepage "https://gal.run"

  livecheck do
    url :stable
    strategy :github_latest
  end

  binary "gal"

  zap trash: [
    "~/.gal",
    "~/.config/gal",
  ]
end
