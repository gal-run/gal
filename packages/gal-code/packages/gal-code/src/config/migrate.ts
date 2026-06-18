import fs from "fs/promises"
import path from "path"
import os from "os"
import { Log } from "@/util/log"

const log = Log.create({ service: "config.migrate" })

export async function migrateConfigPaths() {
  const home = process.env.GAL_CODE_TEST_HOME || os.homedir()
  
  const configDir = process.env.XDG_CONFIG_HOME || path.join(home, ".config")
  const oldGlobal = path.join(configDir, "gal-code")
  const newGlobal = path.join(configDir, "gal-code")
  
  try {
    const oldStat = await fs.stat(oldGlobal).catch(() => null)
    const newStat = await fs.stat(newGlobal).catch(() => null)
    
    if (oldStat?.isDirectory() && !newStat) {
      await fs.cp(oldGlobal, newGlobal, { recursive: true })
      console.log(`Migrated config from ${oldGlobal} to ${newGlobal}`)
      log.info("migrated global config", { from: oldGlobal, to: newGlobal })
    }
  } catch (error) {
    log.warn("failed to migrate global config", { from: oldGlobal, to: newGlobal, error })
  }
  
  const cwd = process.cwd()
  const oldProject = path.join(cwd, ".gal/code")
  const newProject = path.join(cwd, ".gal", "code")
  
  try {
    const oldStat = await fs.stat(oldProject).catch(() => null)
    const newStat = await fs.stat(newProject).catch(() => null)
    
    if (oldStat?.isDirectory() && !newStat) {
      await fs.mkdir(path.dirname(newProject), { recursive: true })
      await fs.cp(oldProject, newProject, { recursive: true })
      console.log(`Migrated project config from ${oldProject} to ${newProject}`)
      log.info("migrated project config", { from: oldProject, to: newProject })
    }
  } catch (error) {
    log.warn("failed to migrate project config", { from: oldProject, to: newProject, error })
  }
}
