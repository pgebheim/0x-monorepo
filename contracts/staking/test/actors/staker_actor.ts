import { expect } from '@0x/contracts-test-utils';
import { BigNumber, RevertError } from '@0x/utils';
import * as _ from 'lodash';

import { StakeBalances, StakeInfo, StakeStatus, StoredBalance } from '../../src/types';
import { StakingApiWrapper } from '../utils/api_wrapper';

import { BaseActor } from './base_actor';

export class StakerActor extends BaseActor {
    private readonly _poolIds: string[];

    private static _incrementNextBalance(balance: StoredBalance, amount: BigNumber): void {
        balance.nextEpochBalance = balance.nextEpochBalance.plus(amount);
    }
    private static _decrementNextBalance(balance: StoredBalance, amount: BigNumber): void {
        balance.nextEpochBalance = balance.nextEpochBalance.minus(amount);
    }
    private static _incrementCurrentAndNextBalance(balance: StoredBalance, amount: BigNumber): void {
        balance.currentEpochBalance = balance.currentEpochBalance.plus(amount);
        balance.nextEpochBalance = balance.nextEpochBalance.plus(amount);
    }
    private static _decrementCurrentAndNextBalance(balance: StoredBalance, amount: BigNumber): void {
        balance.currentEpochBalance = balance.currentEpochBalance.minus(amount);
        balance.nextEpochBalance = balance.nextEpochBalance.minus(amount);
    }

    constructor(owner: string, stakingApiWrapper: StakingApiWrapper) {
        super(owner, stakingApiWrapper);
        this._poolIds = [];
    }

    public async stakeAndMoveAsync(
        from: StakeInfo,
        to: StakeInfo,
        amount: BigNumber,
        revertError?: RevertError,
    ): Promise<void> {
        const initZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        const initBalances = await this._getBalancesAsync();
        // move stake
        const txReceiptPromise = this._stakingApiWrapper.stakingProxyContract.batchExecute.awaitTransactionSuccessAsync(
            [
                this._stakingApiWrapper.stakingContract.stake.getABIEncodedTransactionData(amount),
                this._stakingApiWrapper.stakingContract.moveStake.getABIEncodedTransactionData(from, to, amount),
            ],
            { from: this._owner },
        );
        if (revertError !== undefined) {
            await expect(txReceiptPromise, 'expected revert error').to.revertWith(revertError);
            return;
        }
        await txReceiptPromise;
        // Calculate the expected stake amount.
        const expectedBalances = await this._calculateExpectedBalancesAfterMoveAsync(
            from,
            to,
            amount,
            await this._calculateExpectedBalancesAfterStakeAsync(amount, initBalances),
        );
        await this._assertBalancesAsync(expectedBalances);
        // check zrx balance of vault
        const finalZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        expect(finalZrxBalanceOfVault, 'final balance of zrx vault').to.be.bignumber.equal(
            initZrxBalanceOfVault.plus(amount),
        );
    }

    public async stakeAsync(amount: BigNumber, revertError?: RevertError): Promise<void> {
        const initZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        const initBalances = await this._getBalancesAsync();
        // deposit stake
        const txReceiptPromise = this._stakingApiWrapper.stakingContract.stake.awaitTransactionSuccessAsync(amount, {
            from: this._owner,
        });
        if (revertError !== undefined) {
            await expect(txReceiptPromise, 'expected revert error').to.revertWith(revertError);
            return;
        }
        await txReceiptPromise;
        // @TODO check receipt logs and return value via eth_call
        // check balances
        const expectedBalances = await this._calculateExpectedBalancesAfterStakeAsync(amount, initBalances);
        await this._assertBalancesAsync(expectedBalances);
        // check zrx balance of vault
        const finalZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        expect(finalZrxBalanceOfVault, 'final balance of zrx vault').to.be.bignumber.equal(
            initZrxBalanceOfVault.plus(amount),
        );
    }

    public async unstakeAsync(amount: BigNumber, revertError?: RevertError): Promise<void> {
        const initZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        const initBalances = await this._getBalancesAsync();
        // deposit stake
        const txReceiptPromise = this._stakingApiWrapper.stakingContract.unstake.awaitTransactionSuccessAsync(amount, {
            from: this._owner,
        });
        if (revertError !== undefined) {
            await expect(txReceiptPromise, 'expected revert error').to.revertWith(revertError);
            return;
        }
        await txReceiptPromise;
        // @TODO check receipt logs and return value via eth_call
        // check balances
        const expectedBalances = initBalances;
        expectedBalances.zrxBalance = initBalances.zrxBalance.plus(amount);
        expectedBalances.stakeBalanceInVault = initBalances.stakeBalanceInVault.minus(amount);
        StakerActor._decrementCurrentAndNextBalance(expectedBalances.undelegatedStakeBalance, amount);
        StakerActor._decrementCurrentAndNextBalance(expectedBalances.globalUndelegatedStakeBalance, amount);
        await this._assertBalancesAsync(expectedBalances);
        // check zrx balance of vault
        const finalZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        expect(finalZrxBalanceOfVault, 'final balance of zrx vault').to.be.bignumber.equal(
            initZrxBalanceOfVault.minus(amount),
        );
    }

    public async moveStakeAsync(
        from: StakeInfo,
        to: StakeInfo,
        amount: BigNumber,
        revertError?: RevertError,
    ): Promise<void> {
        // Cache Initial Balances.
        const initZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        // Calculate the expected outcome after the move.
        const expectedBalances = await this._calculateExpectedBalancesAfterMoveAsync(from, to, amount);
        // move stake
        const txReceiptPromise = this._stakingApiWrapper.stakingContract.moveStake.awaitTransactionSuccessAsync(
            from,
            to,
            amount,
            { from: this._owner },
        );
        if (revertError !== undefined) {
            await expect(txReceiptPromise).to.revertWith(revertError);
            return;
        }
        await txReceiptPromise;
        // check balances
        await this._assertBalancesAsync(expectedBalances);
        // check zrx balance of vault
        const finalZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        expect(finalZrxBalanceOfVault, 'final balance of zrx vault').to.be.bignumber.equal(initZrxBalanceOfVault);
    }

    public async stakeWithPoolAsync(poolId: string, amount: BigNumber): Promise<void> {
        await this.stakeAsync(amount);
        await this.moveStakeAsync(
            new StakeInfo(StakeStatus.Undelegated),
            new StakeInfo(StakeStatus.Delegated, poolId),
            amount,
        );
    }

    public async withdrawDelegatorRewardsAsync(poolId: string, revertError?: RevertError): Promise<void> {
        const txReceiptPromise = this._stakingApiWrapper.stakingContract.withdrawDelegatorRewards.awaitTransactionSuccessAsync(
            poolId,
            { from: this._owner },
        );
        if (revertError !== undefined) {
            await expect(txReceiptPromise, 'expected revert error').to.revertWith(revertError);
            return;
        }
        await txReceiptPromise;
    }

    public async goToNextEpochAsync(): Promise<void> {
        // cache balances
        const initZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        const initBalances = await this._getBalancesAsync();
        // go to next epoch
        await this._stakingApiWrapper.utils.skipToNextEpochAndFinalizeAsync();
        // check balances
        const expectedBalances = this._getNextEpochBalances(initBalances);
        await this._assertBalancesAsync(expectedBalances);
        // check zrx balance of vault
        const finalZrxBalanceOfVault = await this._stakingApiWrapper.utils.getZrxTokenBalanceOfZrxVaultAsync();
        expect(finalZrxBalanceOfVault, 'final balance of zrx vault').to.be.bignumber.equal(initZrxBalanceOfVault);
    }
    private _getNextEpochBalances(balances: StakeBalances): StakeBalances {
        const nextBalances = _.cloneDeep(balances);
        for (const balance of [
            nextBalances.undelegatedStakeBalance,
            nextBalances.delegatedStakeBalance,
            nextBalances.globalUndelegatedStakeBalance,
            nextBalances.globalDelegatedStakeBalance,
            ...this._poolIds.map(poolId => nextBalances.delegatedStakeByPool[poolId]),
            ...this._poolIds.map(poolId => nextBalances.totalDelegatedStakeByPool[poolId]),
        ]) {
            balance.currentEpoch = balances.currentEpoch.plus(1);
            balance.currentEpochBalance = balance.nextEpochBalance;
        }
        return nextBalances;
    }
    private async _getBalancesAsync(): Promise<StakeBalances> {
        const balances: StakeBalances = {
            currentEpoch: await this._stakingApiWrapper.stakingContract.currentEpoch.callAsync(),
            zrxBalance: await this._stakingApiWrapper.zrxTokenContract.balanceOf.callAsync(this._owner),
            stakeBalance: await this._stakingApiWrapper.stakingContract.getTotalStake.callAsync(this._owner),
            stakeBalanceInVault: await this._stakingApiWrapper.zrxVaultContract.balanceOf.callAsync(this._owner),
            undelegatedStakeBalance: await this._stakingApiWrapper.stakingContract.getOwnerStakeByStatus.callAsync(
                this._owner,
                StakeStatus.Undelegated,
            ),
            delegatedStakeBalance: await this._stakingApiWrapper.stakingContract.getOwnerStakeByStatus.callAsync(
                this._owner,
                StakeStatus.Delegated,
            ),
            globalUndelegatedStakeBalance: await this._stakingApiWrapper.stakingContract.getGlobalStakeByStatus.callAsync(
                StakeStatus.Undelegated,
            ),
            globalDelegatedStakeBalance: await this._stakingApiWrapper.stakingContract.getGlobalStakeByStatus.callAsync(
                StakeStatus.Delegated,
            ),
            delegatedStakeByPool: {},
            totalDelegatedStakeByPool: {},
        };
        // lookup for each pool
        for (const poolId of this._poolIds) {
            const delegatedStakeBalanceByPool = await this._stakingApiWrapper.stakingContract.getStakeDelegatedToPoolByOwner.callAsync(
                this._owner,
                poolId,
            );
            const totalDelegatedStakeBalanceByPool = await this._stakingApiWrapper.stakingContract.getTotalStakeDelegatedToPool.callAsync(
                poolId,
            );
            balances.delegatedStakeByPool[poolId] = delegatedStakeBalanceByPool;
            balances.totalDelegatedStakeByPool[poolId] = totalDelegatedStakeBalanceByPool;
        }
        return balances;
    }
    private async _assertBalancesAsync(expectedBalances: StakeBalances): Promise<void> {
        const balances = await this._getBalancesAsync();
        expect(balances.zrxBalance, 'zrx balance').to.be.bignumber.equal(expectedBalances.zrxBalance);
        expect(balances.stakeBalanceInVault, 'stake balance, recorded in vault').to.be.bignumber.equal(
            expectedBalances.stakeBalanceInVault,
        );
        expect(
            balances.undelegatedStakeBalance.currentEpochBalance,
            'undelegated stake balance (current)',
        ).to.be.bignumber.equal(expectedBalances.undelegatedStakeBalance.currentEpochBalance);
        expect(
            balances.undelegatedStakeBalance.nextEpochBalance,
            'undelegated stake balance (next)',
        ).to.be.bignumber.equal(expectedBalances.undelegatedStakeBalance.nextEpochBalance);
        expect(
            balances.delegatedStakeBalance.currentEpochBalance,
            'delegated stake balance (current)',
        ).to.be.bignumber.equal(expectedBalances.delegatedStakeBalance.currentEpochBalance);
        expect(balances.delegatedStakeBalance.nextEpochBalance, 'delegated stake balance (next)').to.be.bignumber.equal(
            expectedBalances.delegatedStakeBalance.nextEpochBalance,
        );
        expect(
            balances.globalUndelegatedStakeBalance.currentEpochBalance,
            'global undelegated stake (current)',
        ).to.bignumber.equal(expectedBalances.globalUndelegatedStakeBalance.currentEpochBalance);
        expect(
            balances.globalDelegatedStakeBalance.currentEpochBalance,
            'global delegated stake (current)',
        ).to.bignumber.equal(expectedBalances.globalDelegatedStakeBalance.currentEpochBalance);
        expect(
            balances.globalUndelegatedStakeBalance.nextEpochBalance,
            'global undelegated stake (next)',
        ).to.bignumber.equal(expectedBalances.globalUndelegatedStakeBalance.nextEpochBalance);
        expect(
            balances.globalDelegatedStakeBalance.nextEpochBalance,
            'global delegated stake (next)',
        ).to.bignumber.equal(expectedBalances.globalDelegatedStakeBalance.nextEpochBalance);
        expect(balances.delegatedStakeByPool, 'delegated stake by pool').to.be.deep.equal(
            expectedBalances.delegatedStakeByPool,
        );
        expect(balances.totalDelegatedStakeByPool, 'total delegated stake by pool').to.be.deep.equal(
            expectedBalances.totalDelegatedStakeByPool,
        );
    }

    private async _calculateExpectedBalancesAfterMoveAsync(
        from: StakeInfo,
        to: StakeInfo,
        amount: BigNumber,
        initBalances?: StakeBalances,
    ): Promise<StakeBalances> {
        // check if we're moving stake into a new pool
        if (to.status === StakeStatus.Delegated && to.poolId !== undefined && !_.includes(this._poolIds, to.poolId)) {
            this._poolIds.push(to.poolId);
        }
        // cache balances
        const expectedBalances = initBalances || (await this._getBalancesAsync());
        // @TODO check receipt logs and return value via eth_call
        // check balances
        // from
        if (from.status === StakeStatus.Undelegated) {
            StakerActor._decrementNextBalance(expectedBalances.undelegatedStakeBalance, amount);
            StakerActor._decrementNextBalance(expectedBalances.globalUndelegatedStakeBalance, amount);
        } else if (from.status === StakeStatus.Delegated && from.poolId !== undefined) {
            StakerActor._decrementNextBalance(expectedBalances.delegatedStakeBalance, amount);
            StakerActor._decrementNextBalance(expectedBalances.globalDelegatedStakeBalance, amount);
            StakerActor._decrementNextBalance(expectedBalances.delegatedStakeByPool[from.poolId], amount);
            StakerActor._decrementNextBalance(expectedBalances.totalDelegatedStakeByPool[from.poolId], amount);
        }
        // to
        if (to.status === StakeStatus.Undelegated) {
            StakerActor._incrementNextBalance(expectedBalances.undelegatedStakeBalance, amount);
            StakerActor._incrementNextBalance(expectedBalances.globalUndelegatedStakeBalance, amount);
        } else if (to.status === StakeStatus.Delegated && to.poolId !== undefined) {
            StakerActor._incrementNextBalance(expectedBalances.delegatedStakeBalance, amount);
            StakerActor._incrementNextBalance(expectedBalances.globalDelegatedStakeBalance, amount);
            StakerActor._incrementNextBalance(expectedBalances.delegatedStakeByPool[to.poolId], amount);
            StakerActor._incrementNextBalance(expectedBalances.totalDelegatedStakeByPool[to.poolId], amount);
        }
        return expectedBalances;
    }

    private async _calculateExpectedBalancesAfterStakeAsync(
        amount: BigNumber,
        initBalances?: StakeBalances,
    ): Promise<StakeBalances> {
        const expectedBalances = initBalances || (await this._getBalancesAsync());
        // check balances
        expectedBalances.zrxBalance = expectedBalances.zrxBalance.minus(amount);
        expectedBalances.stakeBalanceInVault = expectedBalances.stakeBalanceInVault.plus(amount);
        StakerActor._incrementCurrentAndNextBalance(expectedBalances.undelegatedStakeBalance, amount);
        StakerActor._incrementCurrentAndNextBalance(expectedBalances.globalUndelegatedStakeBalance, amount);
        return expectedBalances;
    }
}
