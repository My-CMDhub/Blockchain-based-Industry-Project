# Blockchain Payment Gateway - Database Recovery System

This document explains the database recovery system implemented in the Blockchain Payment Gateway application.

## Overview

The database recovery system provides continuous monitoring, automated backups, and recovery options for the JSON-based database files used by the payment gateway. It includes:

1. **Continuous Monitoring**: Automatic detection of database corruption, missing files, or data loss
2. **Automated Backups**: Daily backups of all database files
3. **Manual Recovery**: Admin interface for restoring from backups
4. **Startup Validation**: Database integrity validation on server startup

## Key Files and Directories

- **Database Files**:
  - `merchant_transactions.json`: Transaction history
  - `Json/keys.json`: HD wallet keys and addresses
  - `address_index_map.json`: Mapping of addresses to HD wallet indices
  - `payment_requests.json`: Payment request information

- **Backup Directories**:
  - `database_backups/`: Scheduled and manual backups
  - `corruption_backups/`: Backups created when corruption is detected
  - `uploads/`: Temporary directory for uploaded backup files

- **System Files**:
  - `server/utils/databaseMonitor.js`: Core database monitoring utilities
  - `server/utils/startupValidator.js`: Startup validation logic
  - `server/routes/adminRoutes.js`: API endpoints for database management
  - `scripts/backup-database.js`: Script for scheduled backups
  - `scripts/setup-cron-backup.js`: Script to configure automated backups

## Features

### Monitoring System

The monitoring system continuously checks for:

- **Missing Files**: Detection of missing critical database files
- **File Corruption**: Validation of JSON structure and required fields
- **Data Integrity**: Validation of expected data types and values

When issues are detected, the system:

1. Logs detailed information about the issue
2. Creates a backup of any corrupted files
3. Displays a persistent alert on the admin dashboard
4. Provides recovery options to the administrator

### Backup System

The backup system provides:

- **Automated Daily Backups**: Configured via cron job
- **Manual Backups**: On-demand backups from the admin interface
- **Corruption Backups**: Automatic backups when corruption is detected
- **Remote Storage**: Optional integration with S3, Dropbox, or FTP (configurable)
- **Backup Rotation**: Automatic cleanup of old backups to prevent disk space issues

### Recovery System

Recovery options include:

- **Automatic Repair**: For minor issues, the system attempts to repair automatically
- **Backup Restoration**: Manual restoration from any available backup
- **Backup Upload**: Upload of external backup files
- **System Reinitialization**: Reset of database files to default state while preserving data

## Admin Dashboard

The admin dashboard includes a "Database Management" tab with the following features:

- **Database Status**: Current health status of all database files
- **Issue Details**: Detailed information about any detected issues
- **Backup Management**: Create, download, and restore from backups
- **Recovery Options**: Tools for database recovery and repair

## Setup & Configuration

### Configuring Automated Backups

1. Run the setup script to configure the cron job for automated backups:

```bash
node scripts/setup-cron-backup.js
```

By default, this will set up daily backups at midnight. To customize the schedule:

```bash
node scripts/setup-cron-backup.js --schedule="0 */6 * * *"  # Every 6 hours
```

### Remote Storage Configuration

For remote storage of backups, configure the following environment variables in your `.env` file:

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

# Or, for Dropbox
BACKUP_DROPBOX_TOKEN=your-dropbox-token
BACKUP_DROPBOX_PATH=/blockchain-payment-gateway/backups

# Or, for FTP
BACKUP_FTP_HOST=ftp.example.com
BACKUP_FTP_USER=username
BACKUP_FTP_PASSWORD=password
BACKUP_FTP_PATH=/backups
```

## Best Practices

1. **Regular Backups**: Configure automated backups and periodically verify they're working
2. **Manual Backups Before Changes**: Create manual backups before significant changes to the system
3. **Remote Storage**: Configure remote storage to protect against local system failure
4. **Monitor Admin Dashboard**: Regularly check the admin dashboard for database status
5. **Test Recovery**: Periodically test the recovery process to ensure it works as expected
6. **Secure Backup Files**: Ensure backup files are stored securely, especially if they contain sensitive data

## Troubleshooting

### Common Issues

1. **Persistent Database Alert**: If you see a persistent database alert on the admin dashboard:
   - Check the Database Management tab for detailed information
   - Attempt automatic repair using the "Reinitialize Database System" option
   - If automatic repair fails, restore from a recent backup

2. **Backup Failures**: If backups are failing:
   - Check the `logs/backup.log` file for error details
   - Ensure the application has write permissions to the backup directories
   - Verify that disk space is not exhausted

3. **Restore Failures**: If restoration from backup fails:
   - Verify the backup file integrity using the "Verify" option
   - Check that the file structure matches the expected format
   - Try an older backup if the most recent one is corrupted

### Recovery Steps

If the database is corrupted:

1. Go to the Database Management tab on the admin dashboard
2. Check for detailed information about the issues
3. Create a manual backup of the current state (even if corrupted)
4. Try the "Reinitialize Database System" option
5. If reinitialization fails, restore from the most recent valid backup
6. If no valid backups are available, consult the system logs and contact support

## Security Considerations

- **Backup Encryption**: Database backups may contain sensitive information and should be encrypted if stored remotely
- **Access Control**: The admin dashboard should be protected with strong authentication
- **Backup Validation**: Always validate backups before restoration to prevent malicious uploads
- **Audit Logging**: All database recovery actions are logged for security auditing

## Technical Implementation

The database recovery system uses a combination of:

- **File System Monitoring**: Regular checks of file existence and integrity
- **JSON Schema Validation**: Validation of database file structure and content
- **Checksum Verification**: MD5 checksums to detect file corruption
- **Automatic Repair**: Intelligent repair of minor issues
- **Backup Rotation**: Management of backup files to prevent disk space issues
- **Remote Storage Integration**: Optional integration with cloud storage services

The system is designed to be:

- **Robust**: Resilient to various failure modes
- **Non-invasive**: Minimal impact on normal system operation
- **Secure**: Protection against malicious activity
- **User-friendly**: Simple interface for administrators
- **Maintainable**: Well-documented and modular code 