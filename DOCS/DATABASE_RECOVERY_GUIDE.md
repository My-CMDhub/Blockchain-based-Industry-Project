# Database Recovery System User Guide

This guide explains how to use the database recovery system in the Blockchain Payment Gateway.

## Overview

The database recovery system is designed to:

1. Continuously monitor database health
2. Automatically detect and report issues
3. Create regular backups
4. Provide tools for manual recovery when needed

## Admin Dashboard

The admin dashboard includes a Database Management tab that provides an overview of database health and recovery options.

### Checking Database Status

1. Log in to the admin dashboard
2. Go to the "Database Management" tab
3. View the Database Status panel for current health information
4. If issues are detected, a persistent alert will be displayed

### Creating Manual Backups

1. Go to the "Database Management" tab
2. Click on the "Create Backup" button
3. Enter a reason for the backup (optional)
4. Click "Create Backup"

### Viewing Backup History

1. Go to the "Database Management" tab
2. Scroll to the "Backup History" section
3. View a list of available backups with timestamps and types

### Restoring from Backup

If database corruption is detected:

1. Go to the "Database Management" tab
2. Review the listed backups in the "Backup History" section
3. Click "Verify" next to a backup to check its integrity
4. Click "Restore" next to a verified backup
5. Confirm the restoration action
6. The system will create a backup of the current state before restoring

### Uploading a Backup

To restore from an external backup:

1. Go to the "Database Management" tab
2. Click on the "Upload Backup" button
3. Select a backup file from your computer
4. Click "Upload"
5. Once uploaded, follow the restoration steps above

## Command Line Tools

The system includes several command-line tools for database management:

### Testing the Recovery System

```bash
# Run comprehensive tests for the database recovery system
node scripts/test-database-recovery.js
```

### Creating Backups Manually

```bash
# Create a manual backup
node scripts/backup-database.js --reason=manual

# Create a backup without cleaning up old backups
node scripts/backup-database.js --cleanup=false
```

### Setting Up Automated Backups

```bash
# Set up daily backups at midnight
node scripts/setup-cron-backup.js

# Set up backups every 6 hours
node scripts/setup-cron-backup.js --schedule="0 */6 * * *"

# Set up weekly backups on Sunday at midnight
node scripts/setup-cron-backup.js --schedule="0 0 * * 0"
```

### Cleaning Up Old Backups

```bash
# Clean up old backups (follows retention policy)
node scripts/cleanup-backups.js

# Dry run (show what would be deleted without actually deleting)
DRY_RUN=true node scripts/cleanup-backups.js

# Adjust retention policy
DAILY_RETENTION_DAYS=14 WEEKLY_RETENTION_WEEKS=8 node scripts/cleanup-backups.js
```

## Backup Storage Locations

- Regular backups: `database_backups/` directory
- Corruption backups: `corruption_backups/` directory
- Backup logs: `logs/backup.log`

## Backup Naming Convention

Backup files follow this naming convention:

```
filename.reason.timestamp.bak
```

For example:
- `merchant_transactions.json.scheduled.2023-01-01T00-00-00.000Z.bak` - Scheduled backup
- `keys.json.manual.2023-01-01T12-30-45.123Z.bak` - Manual backup
- `merchant_transactions.json.corrupted.2023-01-02T15-45-30.987Z.bak` - Corruption backup

## Best Practices

1. **Regular Verification**: Periodically check the Database Management tab to verify system health
2. **Manual Backups**: Create manual backups before making significant changes
3. **Backup Rotation**: Configure appropriate retention settings for your needs
4. **Backup Testing**: Periodically test the restoration process
5. **External Storage**: Consider configuring remote backup storage
6. **Monitoring Logs**: Check `logs/backup.log` for backup operation details

## Troubleshooting

### What to do if corruption is detected:

1. Check the Database Management tab for details about the corruption
2. Verify the integrity of recent backups
3. Restore from the most recent valid backup
4. If no valid backups are available, use the system repair option
5. If problems persist, contact system support

### Common Issues:

1. **"Failed to create backup"**: Check disk space and file permissions
2. **"Backup validation failed"**: The backup file may be corrupted, try an earlier backup
3. **"Restore operation failed"**: Ensure the backup file is valid and the system has write permissions

## Remote Storage Configuration

To enable remote storage for backups, configure these environment variables in your `.env` file:

```
# Enable remote storage
BACKUP_REMOTE_ENABLED=true
BACKUP_REMOTE_TYPE=s3  # Options: s3, dropbox, ftp

# AWS S3 Configuration
BACKUP_S3_BUCKET=your-bucket-name
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY=your-access-key
BACKUP_S3_SECRET_KEY=your-secret-key
BACKUP_S3_PATH=database-backups
```

## Security Considerations

- Backups may contain sensitive information and should be secured appropriately
- Encryption of backup data is recommended for remote storage
- Limit access to backup directories and files
- Implement appropriate authentication for the admin dashboard

## Support

If you encounter issues with the database recovery system, please contact system support at support@example.com with the following information:

1. Error messages displayed in the admin dashboard
2. Relevant sections from the logs (`logs/backup.log` and `logs/server.log`)
3. Steps to reproduce the issue 