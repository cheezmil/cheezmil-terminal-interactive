import { execSync } from 'child_process';

console.log('Executing: ctm generate-all-rules');
try {
  execSync('ctm generate-all-rules', { stdio: 'inherit' });
  console.log('Successfully generated all AI tool rules.');
} catch (error) {
  console.error('Failed to generate all AI tool rules:', error.message);
}