class Gal < Formula
  desc "Governance Agentic Layer CLI"
  homepage "https://gal.run"
  version "0.0.667"

  livecheck do
    url :stable
    strategy :github_latest
  end

  on_macos do
    on_arm do
      url "https://github.com/Scheduler-Systems/gal-run/releases/download/v0.0.667/gal-#{version}-darwin-arm64.tar.gz"
      sha256 "83f1c5363aab0494d857ae3bca6a5d738d95ccf2aa2b2034e992b4e1cd5d22e4"
    end

    on_intel do
      url "https://github.com/Scheduler-Systems/gal-run/releases/download/v0.0.667/gal-#{version}-darwin-x64.tar.gz"
      sha256 "f7734a0e88c6355b6741fbb604c79bc12b6585a734c4c3018a062aa4bc947657"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/Scheduler-Systems/gal-run/releases/download/v0.0.667/gal-#{version}-linux-x64.tar.gz"
      sha256 "c7ac9ecd059c7b97a11a041509ccbee29bbddf769d865fc091e2b9e66a311137"
    end
  end

  def install
    libexec.install "gal" => "gal-real"
    bin.mkpath
    bin.install_symlink(var/"gal"/version/"gal" => "gal")
  end

  def post_install
    install_root = var/"gal"/version
    install_root.mkpath

    dest = install_root/"gal"
    dest.delete if dest.exist?
    dest.write((libexec/"gal-real").binread, mode: "wb")
    dest.chmod(0755)
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/gal --version")
  end
end
