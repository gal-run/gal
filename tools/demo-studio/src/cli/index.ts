#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { Recorder, type RecordingProgress } from '../core/recorder.js';
import { VideoProcessor } from '../core/video-processor.js';
import { DemoScriptRunner } from '../core/demo-runner.js';
import { WindowDetector } from '../core/window-detector.js';
import { ScreenCapture } from '../core/screen-capture.js';
import { readFile, writeFile, access } from 'fs/promises';
import { join, basename } from 'path';

const program = new Command();

program
  .name('demo-studio')
  .description('AI-powered software demo video recorder')
  .version('0.1.0');

program
  .command('check')
  .description('Check system dependencies')
  .action(async () => {
    console.log(chalk.blue('Checking system dependencies...\n'));
    
    const recorder = new Recorder();
    const deps = await recorder.checkDependencies();
    
    console.log(`FFmpeg:  ${deps.ffmpeg ? chalk.green('✓ installed') + chalk.gray(` (${deps.version})`) : chalk.red('✗ not found')}`);
    console.log(`FFprobe: ${deps.ffprobe ? chalk.green('✓ installed') : chalk.red('✗ not found')}`);
    
    if (!deps.ffmpeg || !deps.ffprobe) {
      console.log(chalk.yellow('\nInstall FFmpeg:'));
      console.log('  macOS:   brew install ffmpeg');
      console.log('  Ubuntu:  sudo apt install ffmpeg');
      console.log('  Windows: choco install ffmpeg');
      process.exit(1);
    }
    
    const resolution = await recorder.getScreenResolution();
    if (resolution) {
      console.log(`\nScreen:  ${resolution.width}x${resolution.height}`);
    }
    
    console.log(`\nPlatform: ${process.platform}`);
    console.log(`Node.js:  ${process.version}`);
    console.log(chalk.green('\n✓ All dependencies satisfied'));
  });

program
  .command('record')
  .description('Start screen recording')
  .option('-o, --output <path>', 'Output file path', 'demo.mp4')
  .option('-f, --fps <number>', 'Frames per second', '30')
  .option('--audio', 'Enable audio capture')
  .option('--region <x,y,w,h>', 'Capture region')
  .option('-q, --quality <level>', 'Quality (draft/standard/high/production)', 'high')
  .option('--no-cursor', 'Hide cursor')
  .action(async (options) => {
    let region: { x: number; y: number; width: number; height: number } | undefined;
    
    if (options.region) {
      const [x, y, w, h] = options.region.split(',').map(Number);
      region = { x, y, width: w, height: h };
      console.log(chalk.gray(`Recording region: ${x},${y} ${w}x${h}`));
    }

    const recorder = new Recorder({
      output: options.output,
      fps: parseInt(options.fps),
      captureAudio: options.audio || false,
      region,
      quality: options.quality,
      showCursor: options.cursor !== false
    });

    let startTime = 0;

    recorder.on('started', (data: any) => {
      startTime = Date.now();
      console.log(chalk.green('✓ Recording started'));
      console.log(chalk.gray(`Output: ${data.output}`));
      console.log(chalk.yellow('\nPress Ctrl+C to stop\n'));
    });

    recorder.on('progress', (progress: RecordingProgress) => {
      const elapsed = Math.floor(progress.duration);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      
      process.stdout.write(
        `\r${chalk.cyan('⏺')} ${chalk.white(timeStr)} ` +
        `${chalk.gray('│')} Frame: ${chalk.white(progress.frame)} ` +
        `${chalk.gray('│')} FPS: ${chalk.white(progress.fps.toFixed(1))} ` +
        `${chalk.gray('│')} Size: ${chalk.white(progress.size)}  `
      );
    });

    recorder.on('stopped', (data: any) => {
      const mins = Math.floor(data.duration / 60);
      const secs = Math.floor(data.duration % 60);
      console.log(chalk.green(`\n\n✓ Recording saved`));
      console.log(chalk.gray(`Duration: ${mins}m ${secs}s (${data.duration.toFixed(2)}s)`));
      console.log(chalk.gray(`Frames: ${data.frames}`));
      console.log(chalk.gray(`Output: ${data.outputPath}`));
    });

    recorder.on('error', (data: any) => {
      console.error(chalk.red(`\nError: ${data.error}`));
    });

    try {
      await recorder.startRecording();
      
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n\nStopping recording...'));
        try {
          await recorder.stopRecording();
        } catch (e: any) {
          console.error(chalk.red(`Failed to stop: ${e.message}`));
        }
        process.exit(0);
      });

      await new Promise(() => {});
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('info <video>')
  .description('Get video information')
  .action(async (video) => {
    try {
      await access(video);
    } catch {
      console.error(chalk.red(`File not found: ${video}`));
      process.exit(1);
    }

    const processor = new VideoProcessor();
    
    try {
      const info = await processor.getVideoInfo(video);
      console.log(chalk.bold('\nVideo Information\n'));
      console.log(`  ${chalk.cyan('File:')}      ${video}`);
      console.log(`  ${chalk.cyan('Duration:')}  ${formatDuration(info.duration)}`);
      console.log(`  ${chalk.cyan('Resolution:')}${info.width}x${info.height}`);
      console.log(`  ${chalk.cyan('FPS:')}       ${info.fps.toFixed(2)}`);
      console.log(`  ${chalk.cyan('Codec:')}     ${info.codec}`);
      console.log(`  ${chalk.cyan('Bitrate:')}   ${(info.bitrate / 1000).toFixed(0)} kbps`);
      console.log(`  ${chalk.cyan('Audio:')}     ${info.hasAudio ? 'Yes' : 'No'}`);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}m ${secs}.${ms.toString().padStart(2, '0')}s`;
}

program
  .command('trim <input>')
  .description('Trim video (start and end times in seconds)')
  .requiredOption('-o, --output <path>', 'Output file path')
  .option('-s, --start <seconds>', 'Start time', parseFloat)
  .option('-e, --end <seconds>', 'End time', parseFloat)
  .option('-q, --quality <level>', 'Quality', 'high')
  .action(async (input, options) => {
    const processor = new VideoProcessor();
    
    console.log(chalk.blue(`Trimming ${input}...`));
    if (options.start !== undefined) console.log(chalk.gray(`  Start: ${options.start}s`));
    if (options.end !== undefined) console.log(chalk.gray(`  End: ${options.end}s`));
    
    try {
      await processor.process({
        input,
        output: options.output,
        startTime: options.start,
        endTime: options.end,
        quality: options.quality
      });
      
      console.log(chalk.green(`\n✓ Saved to ${options.output}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('resize <input>')
  .description('Resize video')
  .requiredOption('-o, --output <path>', 'Output file path')
  .option('-r, --resolution <WxH>', 'Output resolution (e.g., 1280x720)')
  .option('-w, --width <pixels>', 'Width (keeps aspect ratio)', parseInt)
  .option('-q, --quality <level>', 'Quality', 'high')
  .action(async (input, options) => {
    const processor = new VideoProcessor();
    
    let resolution: { width: number; height: number } | undefined;
    
    if (options.resolution) {
      const [w, h] = options.resolution.split('x').map(Number);
      resolution = { width: w, height: h };
    } else if (options.width) {
      const info = await processor.getVideoInfo(input);
      const aspectRatio = info.height / info.width;
      resolution = { width: options.width, height: Math.round(options.width * aspectRatio) };
    }

    if (!resolution) {
      console.error(chalk.red('Specify --resolution or --width'));
      process.exit(1);
    }

    console.log(chalk.blue(`Resizing to ${resolution.width}x${resolution.height}...`));
    
    try {
      await processor.process({
        input,
        output: options.output,
        resolution,
        quality: options.quality
      });
      
      console.log(chalk.green(`\n✓ Saved to ${options.output}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('gif <input>')
  .description('Convert video to GIF')
  .option('-o, --output <path>', 'Output file path')
  .option('-f, --fps <number>', 'FPS', parseInt, 10)
  .option('-w, --width <pixels>', 'Width', parseInt, 480)
  .action(async (input, options) => {
    const processor = new VideoProcessor();
    const output = options.output || input.replace(/\.\w+$/, '.gif');
    
    console.log(chalk.blue(`Converting to GIF (${options.width}px wide, ${options.fps} fps)...`));
    
    try {
      await processor.convertToGif(input, output, options.fps, options.width);
      console.log(chalk.green(`\n✓ Saved to ${output}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('thumbnail <input>')
  .description('Create video thumbnail')
  .option('-o, --output <path>', 'Output file path')
  .option('-t, --time <seconds>', 'Timestamp', parseFloat, 0)
  .action(async (input, options) => {
    const processor = new VideoProcessor();
    const output = options.output || input.replace(/\.\w+$/, '-thumb.jpg');
    
    try {
      await processor.createThumbnail(input, output, options.time);
      console.log(chalk.green(`✓ Thumbnail saved to ${output}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('concat <output>')
  .description('Concatenate multiple videos')
  .option('-i, --inputs <files>', 'Input files (comma-separated)')
  .action(async (output, options) => {
    if (!options.inputs) {
      console.error(chalk.red('Specify input files with --inputs'));
      process.exit(1);
    }

    const inputs = options.inputs.split(',').map((s: string) => s.trim());
    const processor = new VideoProcessor();
    
    console.log(chalk.blue(`Concatenating ${inputs.length} videos...`));
    inputs.forEach((f: string) => console.log(chalk.gray(`  ${f}`)));
    
    try {
      await processor.concatenate(inputs, output);
      console.log(chalk.green(`\n✓ Saved to ${output}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('windows')
  .description('List all available windows (macOS only)')
  .option('-f, --filter <pattern>', 'Filter windows by name')
  .action(async (options) => {
    if (process.platform !== 'darwin') {
      console.error(chalk.red('Window detection is only available on macOS'));
      console.log(chalk.gray('\nAlternative: Use --region option with record command'));
      process.exit(1);
    }

    const detector = new WindowDetector();
    
    console.log(chalk.blue('Detecting windows...\n'));
    
    try {
      const windows = await detector.listWindows({
        filter: options.filter ? { name: options.filter } : undefined
      });

      if (windows.length === 0) {
        console.log(chalk.yellow('No windows found'));
        return;
      }

      console.log(chalk.bold('Available windows:\n'));
      
      for (const win of windows.slice(0, 20)) {
        console.log(`  ${chalk.white(win.name.substring(0, 40))}`);
        console.log(`    ${chalk.gray('Owner:')}  ${win.owner}`);
        console.log(`    ${chalk.gray('Size:')}   ${win.bounds.width}x${win.bounds.height}`);
        console.log();
      }

      if (windows.length > 20) {
        console.log(chalk.gray(`... and ${windows.length - 20} more`));
      }

      console.log(chalk.gray(`Total: ${windows.length} window(s)`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('screenshot')
  .description('Capture a screenshot')
  .option('-o, --output <path>', 'Output file path', 'screenshot.png')
  .option('--region <x,y,w,h>', 'Capture region')
  .option('-f, --format <format>', 'Output format (png, jpg)', 'png')
  .action(async (options) => {
    const capture = new ScreenCapture();
    
    try {
      let buffer: Buffer;
      
      if (options.region) {
        const [x, y, w, h] = options.region.split(',').map(Number);
        buffer = await capture.captureRegion(x, y, w, h, options.format);
      } else {
        buffer = await capture.captureScreenshot({ format: options.format });
      }

      await writeFile(options.output, buffer);
      console.log(chalk.green(`✓ Screenshot saved to ${options.output}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('create <name>')
  .description('Create a new demo script template')
  .option('-o, --output <path>', 'Output directory', '.')
  .action(async (name, options) => {
    const template = {
      name,
      version: '1.0.0',
      output: {
        path: `${name.toLowerCase().replace(/\s+/g, '-')}.mp4`,
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        quality: 'high'
      },
      recording: {
        captureAudio: false
      },
      steps: [
        { type: 'record', duration: 2 },
        { type: 'text', text: 'Welcome', duration: 1.5 },
        { type: 'click', x: 960, y: 540, duration: 0.5, zoom: { scale: 1.5 } },
        { type: 'keystroke', keys: 'Cmd+K', duration: 1.5 },
        { type: 'zoom', x: 960, y: 540, scale: 1, duration: 0.5 }
      ]
    };

    const outputPath = join(options.output, `${name.toLowerCase().replace(/\s+/g, '-')}.json`);
    await writeFile(outputPath, JSON.stringify(template, null, 2));
    
    console.log(chalk.green(`✓ Demo script created: ${outputPath}`));
    console.log(chalk.gray('\nEdit and run with:'));
    console.log(chalk.cyan(`  demo-studio run ${outputPath} --dry-run`));
  });

program
  .command('run <script>')
  .description('Run a demo script')
  .option('-o, --output <path>', 'Output file path')
  .option('--dry-run', 'Validate script without executing')
  .action(async (script, options) => {
    console.log(chalk.blue(`Loading: ${script}`));

    try {
      const runner = await DemoScriptRunner.fromFile(script);
      
      if (options.dryRun) {
        console.log(chalk.green('\n✓ Script is valid\n'));
        console.log(`Name:     ${runner['config'].name}`);
        console.log(`Steps:    ${runner['config'].steps.length}`);
        console.log(`Output:   ${runner['config'].output?.path || 'demo.mp4'}`);
        return;
      }

      console.log(chalk.blue('\nExecuting...\n'));

      await runner.initialize(join(process.cwd(), 'demo-output'));

      await runner.run((step, total, action) => {
        console.log(`  [${step}/${total}] ${action}`);
      });

      console.log(chalk.green(`\n✓ Completed (${runner.getTotalDuration().toFixed(1)}s)`));

      if (options.output) {
        console.log(chalk.blue('\nRendering...'));
        await runner.export(options.output);
        console.log(chalk.green(`✓ Saved to ${options.output}`));
      }
    } catch (error: any) {
      console.error(chalk.red(`\nError: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('Start MCP server for AI agent control')
  .action(() => {
    console.log(chalk.blue('Starting MCP server...'));
    console.log(chalk.gray('Connect via stdio transport\n'));
    import('../mcp/server.js');
  });

program.parse();
